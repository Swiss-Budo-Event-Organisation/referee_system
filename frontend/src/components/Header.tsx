import { Nav, Navbar } from "react-bootstrap";
import NavbarBlock from "./Navbar";
import ThemeToggle from "./ThemeToggle";
import { useContext } from "react";
import { UserContext } from "../layouts/MainLayout";
import { useHasPermission } from "../features/User/hooks/useUserQueries";

export function Header() {
    const { user } = useContext(UserContext);
    const canCreateEvents = useHasPermission("competition.add_event");
    if (user.isAuthenticated) {
        return (
            <NavbarBlock>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />
                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav>
                        <Nav.Link href="/events">Events</Nav.Link>
                    </Nav>
                    {canCreateEvents && (
                        <Nav>
                            <Nav.Link href="/events/new">New Event</Nav.Link>
                        </Nav>
                    )}
                    <Nav>
                        <Nav.Link href="/profile">Profile</Nav.Link>
                    </Nav>
                    <Nav>
                        <Nav.Link href="/logout">Logout</Nav.Link>
                    </Nav>
                    <ThemeToggle />
                </Navbar.Collapse>
            </NavbarBlock>
        )
    } else {
        return (
            <NavbarBlock>
                <ThemeToggle />
            </NavbarBlock>
        )
    }
}
