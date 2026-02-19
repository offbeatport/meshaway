import { useState, useEffect } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { SessionsList } from "./pages/SessionsList";
import { SessionDetail } from "./pages/SessionDetail";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <SessionsList /> },
      { path: "sessions/:id", element: <SessionDetail /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
