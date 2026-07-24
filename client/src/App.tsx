import { Route, Switch, Redirect } from "wouter";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PeoplePage from "./pages/PeoplePage";
import PersonDetailPage from "./pages/PersonDetailPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import StaffingPage from "./pages/StaffingPage";
import CalendarPage from "./pages/CalendarPage";
import SettingsPage from "./pages/SettingsPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">Caricamento…</div>
    );
  }
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <Protected>
          <Layout>
            <DashboardPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/people">
        <Protected>
          <Layout>
            <PeoplePage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/people/:id">
        {(params) => (
          <Protected>
            <Layout>
              <PersonDetailPage id={Number(params.id)} />
            </Layout>
          </Protected>
        )}
      </Route>
      <Route path="/projects">
        <Protected>
          <Layout>
            <ProjectsPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/projects/:id">
        {(params) => (
          <Protected>
            <Layout>
              <ProjectDetailPage id={Number(params.id)} />
            </Layout>
          </Protected>
        )}
      </Route>
      <Route path="/staffing">
        <Protected>
          <Layout>
            <StaffingPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/calendar">
        <Protected>
          <Layout>
            <CalendarPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/settings">
        <Protected>
          <Layout>
            <SettingsPage />
          </Layout>
        </Protected>
      </Route>
      <Route>
        <div className="flex h-screen items-center justify-center text-slate-400">
          Pagina non trovata
        </div>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}
