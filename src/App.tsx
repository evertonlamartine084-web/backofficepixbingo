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
import PlayerLookup from "@/pages/PlayerLookup";
import Transactions from "@/pages/Transactions";
import Endpoints from "@/pages/admin/Endpoints";
import Discovery from "@/pages/admin/Discovery";
import Segments from "@/pages/Segments";
import Campaigns from "@/pages/Campaigns";
import Popups from "@/pages/Popups";
import Partidas from "@/pages/Partidas";
import ManageUsers from "@/pages/admin/ManageUsers";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
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
              {/* Redirect old /popups route */}
              <Route path="/popups" element={<Popups />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
