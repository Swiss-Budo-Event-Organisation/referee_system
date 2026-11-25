import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Form, Modal, Table } from "react-bootstrap";
import { toast } from "react-toastify";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { formatDate } from "../../../lib/helper";
import { useIsStaff, useProfileQuery } from "../../User/hooks/useUserQueries";
import { usePendingAccountsQuery } from "../hooks/useAccountQueries";
import {
    deleteAccount, fieldErrors, NOTIFICATION_CHOICES, NotificationChoice, PendingAccountType, updateUser,
} from "../utils/Accounts";
import ApproveModal from "./ApproveModal";

const fullName = (a: PendingAccountType) => `${a.first_name} ${a.last_name}`.trim() || a.username;

/** How the staff member wants to hear about accounts awaiting approval. */
function NotificationSetting({ pk }: { pk: number }) {
    const profile = useProfileQuery(pk);
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: (value: NotificationChoice) => updateUser(pk, { account: { approval_notifications: value } }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["profile", pk] });
            toast.success("Your e-mail setting was saved.");
        },
        onError: (error) => Object.values(fieldErrors(error)).flat().forEach((m) => toast.error(m)),
    });
    if (profile.data == null) return null;
    return (
        <Form.Group className="mb-4" style={{ maxWidth: "24rem" }} controlId="approval-notifications">
            <Form.Label>E-mail me when accounts await approval</Form.Label>
            <Form.Select
                value={profile.data.account?.approval_notifications ?? "never"}
                disabled={mutation.isPending}
                onChange={(e) => mutation.mutate(e.target.value as NotificationChoice)}
            >
                {NOTIFICATION_CHOICES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
            <Form.Text muted>The e-mail only says how many accounts are waiting, without names.</Form.Text>
        </Form.Group>
    );
}

function AccountRow({ account }: { account: PendingAccountType }) {
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
            <td className="text-end text-nowrap">
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
            </td>
        </tr>
    );
}

/** Registrations awaiting approval, for staff members. */
function PendingAccounts({ pk }: { pk: number }) {
    const isStaff = useIsStaff();
    const accounts = usePendingAccountsQuery(isStaff === true);

    if (isStaff === undefined) return <LoadingIndicator size="15rem" />;
    if (!isStaff) return <Alert variant="warning">Only staff members may approve accounts.</Alert>;
    return (
        <>
            <h1>Accounts awaiting approval</h1>
            <p className="text-body-secondary">
                Registrations not approved within 30 days are deleted automatically.
            </p>
            <NotificationSetting pk={pk} />
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
                            <th><span className="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {accounts.data.map((account) => <AccountRow key={account.id} account={account} />)}
                    </tbody>
                </Table>
            )}
        </>
    );
}

export default PendingAccounts;
