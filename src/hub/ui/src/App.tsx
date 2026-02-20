import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HubHome } from "./pages/HubHome";
import { SessionsList } from "./pages/SessionsList";
import { SessionDetail } from "./pages/SessionDetail";
import { Playground } from "./pages/Playground";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HubHome /> },
      { path: "sessions", element: <SessionsList /> },
      { path: "sessions/:id", element: <SessionDetail /> },
      { path: "playground", element: <Playground /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
