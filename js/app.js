// App entry: wires the store, plan, services, components and views together.

import { Store, isISODate } from './store.js';
import { loadPlan, dayOf } from './plan.js';
import { fromISO, toISO } from './dates.js';
import { h, setTitle } from './dom.js';
import { Router } from './router.js';
import { SwipeNav } from './swipe.js';
import { RestTimer } from './timer.js';
import { registerServiceWorker } from './pwa.js';
import { TabBar } from './components/tab-bar.js';
import { Toaster } from './components/toast.js';
import { TimerPill } from './components/timer-pill.js';
import { BottomSheet } from './components/sheet.js';
import { SetLogger } from './components/set-logger.js';
import { BackupController } from './components/backup.js';
import { TodayView } from './views/today.js';
import { PlanView } from './views/plan.js';
import { LogView } from './views/log.js';

// ?date=YYYY-MM-DD previews another day (handy for checking run and rest days).
const dateOverride = new URLSearchParams(location.search).get('date');

function currentDay() {
  const date = isISODate(dateOverride) ? fromISO(dateOverride) : new Date();
  return { date, iso: toISO(date), day: dayOf(date) };
}

const outlet = document.getElementById('views');
const toast = new Toaster();
toast.render(document.getElementById('toasts'));

const store = new Store();
const [plan] = await Promise.all([loadPlan().catch((error) => error), store.load()]);

if (plan instanceof Error) {
  outlet.append(
    h(
      'section',
      { class: 'view' },
      h(
        'div',
        { class: 'view-content' },
        h('header', { class: 'page-header' }, h('h1', { class: 'page-title', text: 'Plan not available' })),
        h('div', { class: 'card' }, h('p', { class: 'card-text', text: `${plan.message} Open the app once while online so it can be saved for offline use.` })),
      ),
    ),
  );
} else {
  start(plan);
}

function start(plan) {
  const timer = new RestTimer();
  const sheet = new BottomSheet();
  sheet.render(document.getElementById('sheet'));

  const ctx = { store, plan, timer, sheet, toast, today: currentDay() };
  ctx.logger = new SetLogger(ctx);
  ctx.backup = new BackupController(ctx);
  ctx.openLogger = (exercise) => ctx.logger.open({ exercise, date: ctx.today.iso, day: ctx.today.day });

  const router = new Router({
    outlet,
    fallback: 'today',
    routes: {
      today: { title: 'Today', create: () => new TodayView(ctx) },
      plan: { title: 'Plan', create: () => new PlanView(ctx) },
      log: { title: 'Log', create: () => new LogView(ctx) },
    },
  });
  router.addEventListener('change', (event) => setTitle({ base: `${router.title(event.detail.name)} · Fitness` }));

  new TabBar({ router }).render(document.getElementById('tabbar'));
  new TimerPill({ timer }).render(document.getElementById('timer-pill'));
  new SwipeNav({ outlet, router }).render();
  router.start();

  // Roll over to the new day if the app stays open past midnight.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = currentDay();
    if (now.iso !== ctx.today.iso) {
      ctx.today = now;
      router.invalidateAll();
    }
  });

  registerServiceWorker({
    toast,
    onPlanUpdated: async () => {
      try {
        ctx.plan = await loadPlan();
        router.invalidateAll();
        toast.show('The plan was updated.');
      } catch {
        // Keep the plan we have.
      }
    },
  });

  if (store.loadErrors.length) {
    toast.show('Saved data could not be read. A copy was kept on this device.', { duration: 8000 });
  }
}
