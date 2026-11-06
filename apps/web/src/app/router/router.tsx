import { createBrowserRouter } from 'react-router';
import { AppLayout } from '../layouts/AppLayout';
import { RouteErrorPage } from '../AppErrorBoundary';
import { ActivitiesPage } from '../../features/activities/ActivitiesPage';
import { ActivityEditPage, ActivityFormPage } from '../../features/activities/ActivityFormPage';
import { HouseholdPage } from '../../features/household/HouseholdPage';
import { RoutinesPage } from '../../features/routines/RoutinesPage';
import { DigitalPage } from '../../features/digital-upkeep/DigitalPage';
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
      // A failing screen shows the error panel inside the layout, so navigation still works.
      {
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'activities', element: <ActivitiesPage /> },
          { path: 'activities/new', element: <ActivityFormPage /> },
          { path: 'activities/:activityId/edit', element: <ActivityEditPage /> },
          { path: 'household', element: <HouseholdPage /> },
          { path: 'routines', element: <RoutinesPage /> },
          { path: 'digital', element: <DigitalPage /> },
          { path: 'assets', element: <AssetsPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'insights', element: <InsightsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
