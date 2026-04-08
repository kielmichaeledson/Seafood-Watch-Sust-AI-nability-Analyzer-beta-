
import React, { useState } from 'react';
import { login } from '../services/authService';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = login(username, password);
    if (user) {
      onLogin(user);
    } else {
      setError('Invalid username or password. Try admin/admin or partner/password.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl border border-gray-100">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-[#00629B] leading-tight">
            Seafood Watch <br /> Sust-AI-nability Analyzer
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to analyze your seafood data
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-gray-600 uppercase mb-1">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-[#00629B] focus:border-[#00629B] focus:z-10 sm:text-sm"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" title="Enter your password" className="block text-xs font-semibold text-gray-600 uppercase mb-1">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-[#00629B] focus:border-[#00629B] focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-md text-white bg-[#00629B] hover:bg-[#00497b] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00629B] transition-colors"
            >
              Sign In
            </button>
          </div>
        </form>
        <div className="text-center text-xs text-gray-400">
          Prototype Access: Use "admin/admin" for management or "partner/password" for uploads.
        </div>
      </div>
    </div>
  );
};

export default Login;
