import { ReactNode, useContext } from "react";
import { Container, Nav, Navbar, NavDropdown } from "react-bootstrap";
import { Link, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import { UserContext } from "../layouts/MainLayout";
import { useCanViewPendingAccounts, useHasPermission, useProfileQuery } from "../features/User/hooks/useUserQueries";

/** Whether the path lies at or below the given one, ignoring a trailing slash. */
function within(pathname: string, path: string): boolean {
    const current = pathname.replace(/\/+$/, "");
    return current === path || current.startsWith(path + "/");
}

/** A link of the navigation bar, marked while its page is shown. */
function NavItem({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
    return (
        <Nav.Link as={Link} to={to} eventKey={to} active={active} aria-current={active ? "page" : undefined}>
            {children}
        </Nav.Link>
    );
}

/** The account menu on the right: profile, applications, security settings and logout. */
function AccountMenu({ pk }: { pk: number }) {
    const { pathname } = useLocation();
    const profile = useProfileQuery(pk).data;
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
    const title = (
        <>
            <i className="bi bi-person-circle me-2" aria-hidden="true" />
            {profile?.first_name || profile?.username || "Account"}
        </>
    );
    return (
        <NavDropdown title={title} id="account-menu" align="end"
            active={["/profile", "/applications", "/security"].some((path) => within(pathname, path))}>
            {profile && (
                <>
                    <NavDropdown.Header>
                        <div className="fw-semibold text-body">{name || profile.username}</div>
                        {name && <div className="small">{profile.username}</div>}
                    </NavDropdown.Header>
                    <NavDropdown.Divider />
                </>
            )}
            <NavDropdown.Item as={Link} to="/profile" eventKey="/profile" active={within(pathname, "/profile")}>
                <i className="bi bi-person me-2" aria-hidden="true" />Profile
            </NavDropdown.Item>
            <NavDropdown.Item as={Link} to="/applications" eventKey="/applications"
                active={within(pathname, "/applications")}>
                <i className="bi bi-card-checklist me-2" aria-hidden="true" />My applications
            </NavDropdown.Item>
            <NavDropdown.Item as={Link} to="/security" eventKey="/security" active={within(pathname, "/security")}>
                <i className="bi bi-shield-lock me-2" aria-hidden="true" />Security
            </NavDropdown.Item>
            <NavDropdown.Divider />
            <NavDropdown.Item as={Link} to="/logout" eventKey="/logout">
                <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />Log out
            </NavDropdown.Item>
        </NavDropdown>
    );
}

export function Header() {
    const { user } = useContext(UserContext);
    const { pathname } = useLocation();
    const canCreateEvents = useHasPermission("competition.add_event");
    const canViewPending = useCanViewPendingAccounts();
    const loggedIn = Boolean(user.isAuthenticated);
    const creating = within(pathname, "/events/new");
    return (
        <Navbar expand="lg" className="bg-body-tertiary border-bottom shadow-sm" fixed="top" collapseOnSelect>
            <Container>
                <Navbar.Brand as={Link} to="/" className="fw-semibold">
                    <i className="bi bi-person-badge me-2 text-primary" aria-hidden="true" />Referee Admin
                </Navbar.Brand>
                <Navbar.Toggle aria-controls="main-navbar" />
                <Navbar.Collapse id="main-navbar">
                    <Nav className="me-auto">
                        {loggedIn && (
                            <>
                                <NavItem to="/events" active={within(pathname, "/events") && !creating}>Events</NavItem>
                                {canCreateEvents && <NavItem to="/events/new" active={creating}>New Event</NavItem>}
                                {canViewPending && (
                                    <NavItem to="/accounts/pending" active={within(pathname, "/accounts/pending")}>
                                        Pending accounts
                                    </NavItem>
                                )}
                            </>
                        )}
                    </Nav>
                    <Nav className="align-items-lg-center gap-lg-1">
                        <ThemeToggle />
                        {loggedIn && user.id !== undefined && <AccountMenu pk={user.id} />}
                        {!loggedIn && (
                            <NavItem to="/login" active={within(pathname, "/login")}>
                                <i className="bi bi-box-arrow-in-right me-2" aria-hidden="true" />Log in
                            </NavItem>
                        )}
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>
    );
}
