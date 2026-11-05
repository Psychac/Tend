import { createBrowserRouter } from 'react-router';
import { AppLayout } from '../layouts/AppLayout';
import { ActivitiesPage } from '../../features/activities/ActivitiesPage';
import { ActivityEditPage, ActivityFormPage } from '../../features/activities/ActivityFormPage';
import { AssetsPage } from '../../features/assets/AssetsPage';
import { CalendarPage } from '../../features/calendar/CalendarPage';
import { DashboardPage } from '../../features/dashboard/DashboardPage';
import { SettingsPage } from '../../features/settings/SettingsPage';
import { HistoryPage } from '../../features/history/HistoryPage';
import { InsightsPage } from '../../features/insights/InsightsPage';

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'activities', element: <ActivitiesPage /> },
      { path: 'activities/new', element: <ActivityFormPage /> },
      { path: 'activities/:activityId/edit', element: <ActivityEditPage /> },
      { path: 'assets', element: <AssetsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
