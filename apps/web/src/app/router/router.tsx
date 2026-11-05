import { createBrowserRouter } from 'react-router';
import { AppLayout } from '../layouts/AppLayout';
import { ActivitiesPage } from '../../features/activities/ActivitiesPage';
import { ActivityFormPage } from '../../features/activities/ActivityFormPage';
import { DashboardPage } from '../../features/dashboard/DashboardPage';
import { PlaceholderPage } from '../../shared/PlaceholderPage';

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'activities', element: <ActivitiesPage /> },
      { path: 'activities/new', element: <ActivityFormPage /> },
      { path: 'assets', element: <PlaceholderPage title="Assets" /> },
      { path: 'calendar', element: <PlaceholderPage title="Calendar" /> },
      { path: 'history', element: <PlaceholderPage title="History" /> },
      { path: 'insights', element: <PlaceholderPage title="Insights" /> },
      { path: 'settings', element: <PlaceholderPage title="Settings" /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
