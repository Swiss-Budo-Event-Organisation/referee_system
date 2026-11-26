import { FormEvent, useState } from "react";
import { Button, Col, Form, Row } from "react-bootstrap";
import CollapsibleCard from "../../../components/CollapsibleCard";
import MultiSelectDropdown from "../../../components/MultiSelectDropdown";
import { APPLICATION_STATUSES } from "../../Events/utils/Application";
import { HistoricSearchType, isEmptySearch, NO_HISTORIC_SEARCH } from "../utils/User";

type HistoricSearchFormProps = {
    /** Called with the criteria, or with null once they are reset. */
    onSearch: (criteria: HistoricSearchType | null) => void;
    /** The criteria searched for, null without a search. */
    active: HistoricSearchType | null;
};

/**
 * The search of all the user's applications on the server, to find old
 * ones that have not been loaded. Every field is optional. It is collapsed
 * unless a search is shown.
 */
function HistoricSearchForm({ onSearch, active }: HistoricSearchFormProps) {
    const [criteria, setCriteria] = useState<HistoricSearchType>(active ?? NO_HISTORIC_SEARCH);
    const set = (changes: Partial<HistoricSearchType>) => setCriteria((current) => ({ ...current, ...changes }));

    function submit(e: FormEvent) {
        e.preventDefault();
        onSearch(isEmptySearch(criteria) ? null : criteria);
    }

    function reset() {
        setCriteria(NO_HISTORIC_SEARCH);
        onSearch(null);
    }

    return (
        <div className="mb-3">
            <CollapsibleCard title="Historic search" defaultOpen={active !== null}>
                <Form onSubmit={submit} aria-label="Historic search">
                    <p className="small text-body-secondary">
                        Searches all your applications, also those not loaded yet. Every field is optional.
                    </p>
                    <Row className="g-2">
                        <Form.Group as={Col} sm={6} lg={3} controlId="historic-start-after">
                            <Form.Label className="small mb-1">Starting from</Form.Label>
                            <Form.Control type="date" value={criteria.start_after}
                                max={criteria.start_before || undefined}
                                onChange={(e) => set({ start_after: e.target.value })} />
                        </Form.Group>
                        <Form.Group as={Col} sm={6} lg={3} controlId="historic-start-before">
                            <Form.Label className="small mb-1">Starting until</Form.Label>
                            <Form.Control type="date" value={criteria.start_before}
                                min={criteria.start_after || undefined}
                                onChange={(e) => set({ start_before: e.target.value })} />
                        </Form.Group>
                        <Form.Group as={Col} sm={6} lg={3} controlId="historic-location">
                            <Form.Label className="small mb-1">Location</Form.Label>
                            <Form.Control type="search" value={criteria.location} placeholder="Name, address, city…"
                                onChange={(e) => set({ location: e.target.value })} />
                        </Form.Group>
                        <Form.Group as={Col} sm={6} lg={3}>
                            <Form.Label className="small mb-1" htmlFor="historic-status">Status</Form.Label>
                            <MultiSelectDropdown id="historic-status" options={APPLICATION_STATUSES}
                                selected={criteria.status} onChange={(status) => set({ status })}
                                placeholder="Any status" searchPlaceholder="Search status…" />
                        </Form.Group>
                        <Form.Group as={Col} lg={9} controlId="historic-text">
                            <Form.Label className="small mb-1">Text</Form.Label>
                            <Form.Control type="search" value={criteria.search}
                                placeholder="Anywhere in the application, competition or event"
                                onChange={(e) => set({ search: e.target.value })} />
                        </Form.Group>
                        <Col lg={3} className="d-flex align-items-end gap-2">
                            <Button type="submit" className="flex-grow-1">
                                <i className="bi bi-search me-1" aria-hidden="true" /> Search
                            </Button>
                            {(active !== null || !isEmptySearch(criteria)) && (
                                <Button variant="outline-secondary" onClick={reset}>Reset</Button>
                            )}
                        </Col>
                    </Row>
                </Form>
            </CollapsibleCard>
        </div>
    );
}

export default HistoricSearchForm;
