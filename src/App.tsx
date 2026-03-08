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
import Inbox from "@/pages/assets/Inbox";
import Push from "@/pages/assets/Push";
import Levels from "@/pages/assets/Levels";
import Store from "@/pages/assets/Store";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
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
              <Route path="/assets/inbox" element={<Inbox />} />
              <Route path="/assets/push" element={<Push />} />
              <Route path="/assets/levels" element={<Levels />} />
              <Route path="/assets/store" element={<Store />} />
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
);

export default App;
