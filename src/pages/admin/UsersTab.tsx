import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { KeyRound, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { api } from "../../api";
import type { Role, User } from "../../types";
import { errorMessage, formatDate } from "../../lib/helpers";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Panel } from "../../components/ui/card";
import { Field, Input, Select } from "../../components/ui/input";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { useToast } from "../../components/toast";

export function UsersTab({ currentUser }: { currentUser: User }) {
  const toast = useToast();
  const [users, setUsers] = useState<User[] | null>(null);

  async function reload() {
    setUsers(await api.users());
  }

  useEffect(() => {
    reload().catch((error) => toast.error(errorMessage(error, "Could not load users")));
  }, []);

  const adminCount = users?.filter((user) => user.role === "admin").length ?? 0;

  return (
    <div className="admin-grid admin-grid-users">
      <Panel icon={<Users size={18} />} title="People" description="Admins can edit everything. Users can sign in to see private live-data cards but can't change anything.">
        {users === null ? (
          <div className="skeleton-lines"><span /><span /><span /></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>User</th><th>Role</th><th className="hide-sm">Added</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === currentUser.id;
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="user-cell">
                          <span className="avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
                          <strong>{user.username}</strong>
                          {isSelf && <Badge tone="primary">You</Badge>}
                        </div>
                      </td>
                      <td><Badge tone={user.role === "admin" ? "success" : "neutral"}>{user.role === "admin" ? <><ShieldCheck size={12} /> Admin</> : "User"}</Badge></td>
                      <td className="hide-sm muted-text">{formatDate(user.createdAt)}</td>
                      <td>
                        <div className="row-actions">
                          <EditUserDialog user={user} isSelf={isSelf} onSaved={reload} />
                          <ConfirmDialog
                            title={`Delete ${user.username}?`}
                            description="They will be signed out and can no longer log in."
                            onConfirm={async () => {
                              await api.deleteUser(user.id);
                              await reload();
                              toast.success(`${user.username} deleted`);
                            }}
                          >
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete ${user.username}`}
                              disabled={isSelf}
                              title={isSelf ? "You can't delete your own account" : undefined}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </ConfirmDialog>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {adminCount === 1 && users && users.length > 0 && (
          <p className="panel-note">Tip: you are the only admin. Consider adding a second admin account as a backup.</p>
        )}
      </Panel>

      <Panel icon={<UserPlus size={18} />} title="Add a person">
        <AddUserForm onCreated={reload} />
      </Panel>
    </div>
  );
}

function AddUserForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const username = String(form.get("username") || "").trim();
    setSaving(true);
    try {
      await api.createUser({ username, password: String(form.get("password") || ""), role: form.get("role") as Role });
      await onCreated();
      formElement.reset();
      toast.success(`${username} added`);
    } catch (error) {
      toast.error(errorMessage(error, "Could not add user"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Username"><Input name="username" autoComplete="off" required /></Field>
      <Field label="Password"><Input name="password" type="password" autoComplete="new-password" required /></Field>
      <Field label="Role">
        <Select name="role" defaultValue="user">
          <option value="user">User (view only)</option>
          <option value="admin">Admin (can edit)</option>
        </Select>
      </Field>
      <div className="form-actions">
        <Button type="submit" disabled={saving}><UserPlus size={15} /> {saving ? "Adding…" : "Add person"}</Button>
      </div>
    </form>
  );
}

function EditUserDialog({ user, isSelf, onSaved }: { user: User; isSelf: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");
    const role = (form.get("role") as Role | null) ?? user.role;
    if (password !== confirm) return toast.error("Passwords don't match.");
    const changes: { password?: string; role?: Role } = {};
    if (password) changes.password = password;
    if (role !== user.role) changes.role = role;
    if (!Object.keys(changes).length) return setOpen(false);
    setSaving(true);
    try {
      await api.updateUser(user.id, changes);
      await onSaved();
      setOpen(false);
      toast.success(`${user.username} updated`);
    } catch (error) {
      toast.error(errorMessage(error, "Could not update user"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.username}`}><KeyRound size={15} /></Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-sm">
          <div className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">Edit {user.username}</Dialog.Title>
              <Dialog.Description className="dialog-description">Reset the password or change the role.</Dialog.Description>
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close"><X size={16} /></Button></Dialog.Close>
          </div>
          <form className="form" onSubmit={submit}>
            <Field label="Role" hint={isSelf ? "You can't remove your own admin role." : undefined}>
              <Select name="role" defaultValue={user.role} disabled={isSelf}>
                <option value="user">User (view only)</option>
                <option value="admin">Admin (can edit)</option>
              </Select>
            </Field>
            <Field label="New password" hint="Leave blank to keep the current password.">
              <Input name="password" type="password" autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password"><Input name="confirm" type="password" autoComplete="new-password" /></Field>
            <div className="dialog-actions">
              <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
