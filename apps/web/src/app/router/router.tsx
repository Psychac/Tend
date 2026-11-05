import { createBrowserRouter } from 'react-router';
import { AppLayout } from '../layouts/AppLayout';
import { PlaceholderPage } from '../../shared/PlaceholderPage';

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <PlaceholderPage title="Dashboard" /> },
      { path: 'activities', element: <PlaceholderPage title="Activities" /> },
      { path: 'assets', element: <PlaceholderPage title="Assets" /> },
      { path: 'calendar', element: <PlaceholderPage title="Calendar" /> },
      { path: 'history', element: <PlaceholderPage title="History" /> },
      { path: 'insights', element: <PlaceholderPage title="Insights" /> },
      { path: 'settings', element: <PlaceholderPage title="Settings" /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
