import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import People from "./pages/People";
import PersonDetail from "./pages/PersonDetail";
import Projects from "./pages/Projects";
import Staffing from "./pages/Staffing";
import CalendarWeekly from "./pages/CalendarWeekly";
import CalendarMonthly from "./pages/CalendarMonthly";
import CalendarYearly from "./pages/CalendarYearly";
import Settings from "./pages/Settings";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/people" component={People} />
        <Route path="/people/:id" component={PersonDetail} />
        <Route path="/projects" component={Projects} />
        <Route path="/staffing" component={Staffing} />
        <Route path="/calendar/weekly" component={CalendarWeekly} />
        <Route path="/calendar/monthly" component={CalendarMonthly} />
        <Route path="/calendar/yearly" component={CalendarYearly} />
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
