
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { getUsers, addUser, removeUser, updateUser } from '../services/authService';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  useEffect(() => {
    setUsers(getUsers());
  }, []);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      alert("Username and Password are required.");
      return;
    }
    const added = addUser({
      username: newUsername,
      email: newEmail,
      company: newCompany,
      role: newRole,
      password: newPassword
    });
    setUsers([...users, added]);
    setNewUsername('');
    setNewEmail('');
    setNewCompany('');
    setNewPassword('');
  };

  const handleRemove = (id: string) => {
    if (window.confirm("Are you sure you want to remove this account?")) {
      removeUser(id);
      setUsers(users.filter(u => u.id !== id));
    }
  };

  const handleResetPassword = (id: string) => {
    if (!resetPasswordValue.trim()) {
      alert("Please enter a new password.");
      return;
    }
    updateUser(id, { password: resetPasswordValue });
    setEditingUserId(null);
    setResetPasswordValue('');
    setUsers(getUsers()); // Refresh view
    alert("Password updated successfully.");
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Partner Account Management</h2>
      
      <form onSubmit={handleAdd} className="mb-10 p-6 bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-6">
        <h3 className="col-span-full font-bold text-gray-700 uppercase text-xs tracking-wider">Create New Account</h3>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username *</label>
          <input 
            type="text" 
            value={newUsername} 
            onChange={(e) => setNewUsername(e.target.value)}
            className="w-full px-3 py-2 border rounded shadow-sm focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. jsmith"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
          <input 
            type="email" 
            value={newEmail} 
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded shadow-sm focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. john@example.com"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Company</label>
          <input 
            type="text" 
            value={newCompany} 
            onChange={(e) => setNewCompany(e.target.value)}
            className="w-full px-3 py-2 border rounded shadow-sm focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. Seafood Corp"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Initial Password *</label>
          <input 
            type="password" 
            value={newPassword} 
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded shadow-sm focus:ring-1 focus:ring-blue-500"
            placeholder="Password"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role</label>
          <select 
            value={newRole} 
            onChange={(e) => setNewRole(e.target.value as UserRole)}
            className="w-full px-3 py-2 border rounded shadow-sm focus:ring-1 focus:ring-blue-500"
          >
            <option value="user">Standard Partner</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="flex items-end">
          <button 
            type="submit" 
            className="w-full bg-[#00629B] text-white px-6 py-2 rounded font-bold hover:bg-blue-700 transition-colors h-[42px]"
          >
            Add Account
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner Info</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-4">
                    <div className="text-sm font-bold text-gray-900">{u.username}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                    <div className="text-xs font-medium text-blue-600">{u.company}</div>
                </td>
                <td className="px-4 py-4 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex flex-col items-end gap-2">
                    {editingUserId === u.id ? (
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                value={resetPasswordValue}
                                onChange={(e) => setResetPasswordValue(e.target.value)}
                                placeholder="New Pass"
                                className="text-xs border px-2 py-1 rounded w-24"
                            />
                            <button 
                                onClick={() => handleResetPassword(u.id)}
                                className="text-green-600 font-bold text-xs"
                            >
                                Save
                            </button>
                            <button 
                                onClick={() => setEditingUserId(null)}
                                className="text-gray-400 font-bold text-xs"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setEditingUserId(u.id)}
                                className="text-blue-600 hover:text-blue-800 text-xs font-bold"
                            >
                                Reset Password
                            </button>
                            <button 
                                onClick={() => handleRemove(u.id)}
                                className="text-red-600 hover:text-red-900 text-xs font-bold"
                            >
                                Remove
                            </button>
                        </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagement;
