import { useContext } from "react";
import { Nav } from "react-bootstrap";
import { UserContext } from "../layouts/UserContext";

/** Switches between the light and the dark theme; the icon shows the theme it switches to. */
function ThemeToggle() {
    const { theme, toggleTheme } = useContext(UserContext)
    const next = theme === "dark" ? "light" : "dark";
    return (
        <Nav.Link as="button" type="button" className="btn btn-link border-0 text-start" onClick={() => toggleTheme()}
            aria-label="Change Theme Colour" title={`Switch to the ${next} theme`}>
            <i className={next === "dark" ? "bi bi-moon-stars" : "bi bi-sun"} aria-hidden="true" />
            {/* Spelled out in the collapsed menu, where the icon alone looks lost. */}
            <span className="d-lg-none ms-2">{next === "dark" ? "Dark theme" : "Light theme"}</span>
        </Nav.Link>
    )
}

export default ThemeToggle
