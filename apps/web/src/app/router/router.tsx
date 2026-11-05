import { createBrowserRouter } from 'react-router';
import { AppLayout } from '../layouts/AppLayout';
import { ActivitiesPage } from '../../features/activities/ActivitiesPage';
import { ActivityFormPage } from '../../features/activities/ActivityFormPage';
import { AssetsPage } from '../../features/assets/AssetsPage';
import { DashboardPage } from '../../features/dashboard/DashboardPage';
import { SettingsPage } from '../../features/settings/SettingsPage';
import { PlaceholderPage } from '../../shared/PlaceholderPage';

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'activities', element: <ActivitiesPage /> },
      { path: 'activities/new', element: <ActivityFormPage /> },
      { path: 'assets', element: <AssetsPage /> },
      { path: 'calendar', element: <PlaceholderPage title="Calendar" /> },
      { path: 'history', element: <PlaceholderPage title="History" /> },
      { path: 'insights', element: <PlaceholderPage title="Insights" /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
