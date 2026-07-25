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
import AbsencesPage from "./pages/AbsencesPage";
import PMOverviewPage from "./pages/PMOverviewPage";
import SettingsPage from "./pages/SettingsPage";

function Protected({ tab, children }: { tab?: string; children: React.ReactNode }) {
  const { user, loading, can } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">Caricamento…</div>
    );
  }
  if (!user) return <Redirect to="/login" />;
  if (tab && !can(tab)) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-slate-400 dark:text-slate-500">
          <span className="text-3xl">🔒</span>
          <p className="font-medium text-slate-600 dark:text-slate-300">Non hai accesso a questa sezione</p>
          <p className="text-sm">Contatta un amministratore per richiedere i permessi.</p>
        </div>
      </Layout>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <Protected tab="dashboard">
          <Layout>
            <DashboardPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/people">
        <Protected tab="people">
          <Layout>
            <PeoplePage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/people/:id">
        {(params) => (
          <Protected tab="people">
            <Layout>
              <PersonDetailPage id={Number(params.id)} />
            </Layout>
          </Protected>
        )}
      </Route>
      <Route path="/projects">
        <Protected tab="projects">
          <Layout>
            <ProjectsPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/projects/:id">
        {(params) => (
          <Protected tab="projects">
            <Layout>
              <ProjectDetailPage id={Number(params.id)} />
            </Layout>
          </Protected>
        )}
      </Route>
      <Route path="/staffing">
        <Protected tab="staffing">
          <Layout>
            <StaffingPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/calendar">
        <Protected tab="calendar">
          <Layout>
            <CalendarPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/absences">
        <Protected tab="absences">
          <Layout>
            <AbsencesPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/per-pm">
        <Protected tab="per-pm">
          <Layout>
            <PMOverviewPage />
          </Layout>
        </Protected>
      </Route>
      <Route path="/settings">
        <Protected tab="settings">
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
