import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Modal, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { formatDate } from "../../../lib/helper";
import { useCanApproveAccounts, useCanViewPendingAccounts } from "../../User/hooks/useUserQueries";
import { usePendingAccountsQuery } from "../hooks/useAccountQueries";
import {
    deleteAccount, fieldErrors, PendingAccountType,
} from "../utils/Accounts";
import ApproveModal from "./ApproveModal";

const fullName = (a: PendingAccountType) => `${a.first_name} ${a.last_name}`.trim() || a.username;

function AccountRow({ account, canApprove }: { account: PendingAccountType; canApprove: boolean }) {
    const [approving, setApproving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const queryClient = useQueryClient();
    const name = fullName(account);
    const mutation = useMutation({
        mutationFn: () => deleteAccount(account.id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["accounts", "pending"] });
            toast.success(`The registration of ${name} was deleted.`);
            setDeleting(false);
        },
        onError: (error) => Object.values(fieldErrors(error)).flat().forEach((m) => toast.error(m)),
    });
    return (
        <tr>
            <td>{name}</td>
            <td>{account.username}</td>
            <td>{account.email}</td>
            <td>{formatDate(new Date(account.date_joined))}</td>
            <td>{formatDate(new Date(account.expires))}</td>
            {canApprove && <td className="text-end text-nowrap">
                <Button size="sm" variant="success" className="me-2" onClick={() => setApproving(true)}>
                    <i className="bi bi-check-lg me-1" aria-hidden="true" /> Approve
                </Button>
                <Button size="sm" variant="outline-danger" onClick={() => setDeleting(true)}>
                    <i className="bi bi-trash me-1" aria-hidden="true" /> Delete
                </Button>
                <ApproveModal account={account} show={approving} onHide={() => setApproving(false)} />
                <Modal show={deleting} onHide={() => setDeleting(false)} aria-labelledby={`delete-title-${account.id}`}>
                    <Modal.Header closeButton>
                        <Modal.Title id={`delete-title-${account.id}`}>Delete the registration?</Modal.Title>
                    </Modal.Header>
                    <Modal.Body className="text-start">
                        The registration of {name} ({account.email}) is deleted. This cannot be undone.
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button>
                        <Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Delete</Button>
                    </Modal.Footer>
                </Modal>
            </td>}
        </tr>
    );
}

/** Registrations awaiting approval, for staff members. */
function PendingAccounts() {
    const canView = useCanViewPendingAccounts();
    const canApprove = useCanApproveAccounts() === true;
    const accounts = usePendingAccountsQuery(canView === true);

    if (canView === undefined) return <LoadingIndicator size="15rem" />;
    if (!canView) return <Alert variant="warning">You may not see the accounts awaiting approval.</Alert>;
    return (
        <>
            <h1>Accounts awaiting approval</h1>
            <p className="text-body-secondary">
                Registrations not approved within 30 days are deleted automatically. You can choose to get an
                e-mail when accounts are waiting under Notifications on <Link to="/profile">your profile</Link>.
            </p>
            {accounts.isLoading && <LoadingIndicator />}
            {accounts.isError && <Alert variant="warning">The accounts could not be loaded.</Alert>}
            {accounts.data?.length === 0 && <p>No accounts are awaiting approval.</p>}
            {accounts.data && accounts.data.length > 0 && (
                <Table responsive hover className="align-middle">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Username</th>
                            <th>E-mail</th>
                            <th>Registered</th>
                            <th>Deleted on</th>
                            {canApprove && <th><span className="visually-hidden">Actions</span></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {accounts.data.map((account) => <AccountRow key={account.id} account={account} canApprove={canApprove} />)}
                    </tbody>
                </Table>
            )}
        </>
    );
}

export default PendingAccounts;
