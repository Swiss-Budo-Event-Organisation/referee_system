import { lazy, Suspense, useContext, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Route, Navigate, createBrowserRouter, createRoutesFromElements, RouterProvider, useNavigate } from "react-router-dom";
import LoadingIndicator from "./components/LoadingIndicator";
import { UserContext } from "./layouts/UserContext";
import { logout } from "./lib/allauth";
import { clearTokens } from "./lib/auth";

const CompetitionInvitation = lazy(() => import("./pages/CompetitionInvitation"));
const ConfirmEmail = lazy(() => import("./pages/ConfirmEmail"));
const EventOverview = lazy(() => import("./pages/EventOverview"));
const EventCreate = lazy(() => import("./pages/EventCreate"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const EventEdit = lazy(() => import("./pages/EventEdit"));
const EventDetails = lazy(() => import("./pages/EventDetails"));
const Login = lazy(() => import("./pages/Login"));
const MainLayout = lazy(() => import("./layouts/MainLayout"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const PendingAccounts = lazy(() => import("./pages/PendingAccounts"));
const ProtectedRoute = lazy(() => import("./components/ProtectedRoute"));
const Register = lazy(() => import("./pages/Register"));
const Security = lazy(() => import("./pages/Security"));
const UserApplications = lazy(() => import("./pages/UserApplications"));
const UserProfile = lazy(() => import("./pages/UserProfile"));


/**
 * Ends the session on the server, which also revokes the tokens, then
 * forgets everything loaded for the user; the theme is kept.
 */
function Logout() {
  const { setUser } = useContext(UserContext);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // The user is forgotten before leaving, or the login page would still see them.
  useEffect(() => {
    logout()
      .catch(() => { /* The tokens are cleared locally anyway. */ })
      .finally(() => {
        queryClient.clear();
        setUser({ "id": undefined, "isAuthenticated": false });
        navigate("/login", { replace: true });
      });
  }, [queryClient, setUser, navigate]);
  return <LoadingIndicator />
}

function RegisterandLogout() {
  clearTokens()
  return <Register />
}

function App() {

  const router = createBrowserRouter(createRoutesFromElements(
    <>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/events/" />} />
        <Route path="events/" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <EventOverview />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="events/new" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <EventCreate />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="events/:pk/details" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <EventDetails />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="events/:pk/edit" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <EventEdit />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="events/:pk" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <EventDetail />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="competitions/:pk/invitation" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <CompetitionInvitation />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="profile" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <UserProfile />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="applications" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <UserApplications />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="security" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <Security />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="onboarding" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="accounts/pending" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ProtectedRoute>
              <PendingAccounts />
            </ProtectedRoute>
          </Suspense>
        } />
        <Route path="confirm-email" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <ConfirmEmail />
          </Suspense>
        } />
        <Route path="login" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <Login />
          </Suspense>
        } />
        <Route path="logout" element={<Logout />} />
        <Route path="*" element={
          <Suspense fallback={<LoadingIndicator size="15rem" />}>
            <NotFound />
          </Suspense>
        } />
      </Route>
      <Route path="register" element={
        <RegisterandLogout />
      } />
    </>
  ))

  return <RouterProvider router={router} />
}

export default App
