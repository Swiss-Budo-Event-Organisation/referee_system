import { ReactNode, useId, useState } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle, Collapse } from "react-bootstrap";

type CollapsibleCardProps = {
    title: string;
    /** Whether the card starts open; it starts collapsed by default. */
    defaultOpen?: boolean;
    /** Makes the card controlled: whether it is open. */
    open?: boolean;
    onToggle?: (open: boolean) => void;
    /** Buttons on the right of the header, e.g. a pen to edit. */
    actions?: ReactNode;
    children: ReactNode;
};

/** A card collapsed to its header until opened, to save space. */
function CollapsibleCard({ title, defaultOpen = false, open, onToggle, actions, children }: CollapsibleCardProps) {
    const [ownOpen, setOwnOpen] = useState(defaultOpen);
    const isOpen = open ?? ownOpen;
    const bodyId = useId();

    function toggle() {
        setOwnOpen(!isOpen);
        onToggle?.(!isOpen);
    }

    return (
        <Card>
            <CardHeader className={`d-flex align-items-center column-gap-2${isOpen ? "" : " border-bottom-0"}`}>
                <Button variant="link" className="d-flex align-items-center gap-2 p-0 me-auto text-reset text-decoration-none"
                    aria-expanded={isOpen} aria-controls={bodyId} onClick={toggle}>
                    <i className={`bi bi-chevron-${isOpen ? "down" : "right"} small`} aria-hidden="true" />
                    <CardTitle as="span" className="mb-0">{title}</CardTitle>
                </Button>
                {actions}
            </CardHeader>
            <Collapse in={isOpen}>
                <div id={bodyId}>
                    <CardBody>{children}</CardBody>
                </div>
            </Collapse>
        </Card>
    );
}

export default CollapsibleCard;
