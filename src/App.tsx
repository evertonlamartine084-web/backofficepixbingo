import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const PlayerLookup = lazy(() => import("@/pages/PlayerLookup"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Endpoints = lazy(() => import("@/pages/admin/Endpoints"));
const Discovery = lazy(() => import("@/pages/admin/Discovery"));
const Segments = lazy(() => import("@/pages/Segments"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Popups = lazy(() => import("@/pages/Popups"));
const Partidas = lazy(() => import("@/pages/Partidas"));
const ManageUsers = lazy(() => import("@/pages/admin/ManageUsers"));
const Profile = lazy(() => import("@/pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60_000,
      networkMode: 'always',
    },
  },
});

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/segments" element={<Segments />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/assets/popups" element={<Popups />} />
              <Route path="/partidas" element={<Partidas />} />
              <Route path="/player" element={<PlayerLookup />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/admin/endpoints" element={<Endpoints />} />
              <Route path="/admin/discovery" element={<Discovery />} />
              <Route path="/admin/manage-users" element={<ManageUsers />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/popups" element={<Popups />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
