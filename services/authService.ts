
import { User, UserRole } from '../types';

const USERS_KEY = 'seafoodWatchUsers';
const SESSION_KEY = 'seafoodWatchSession';

const DEFAULT_USERS: User[] = [
  { id: '1', username: 'admin', role: 'admin', email: 'admin@seafoodwatch.org', company: 'Seafood Watch', password: 'admin' },
  { id: '2', username: 'partner', role: 'user', email: 'partner@example.com', company: 'Global Seafoods', password: 'password' },
];

export function getUsers(): User[] {
  const stored = localStorage.getItem(USERS_KEY);
  if (!stored) {
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  return JSON.parse(stored);
}

export function addUser(userData: Omit<User, 'id'>): User {
  const users = getUsers();
  const newUser = { ...userData, id: Date.now().toString() };
  const updated = [...users, newUser];
  localStorage.setItem(USERS_KEY, JSON.stringify(updated));
  return newUser;
}

export function updateUser(id: string, updates: Partial<User>): User | null {
  const users = getUsers();
  const index = users.findIndex(u => u.id === id);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return users[index];
  }
  return null;
}

export function removeUser(id: string) {
  const users = getUsers();
  const updated = users.filter(u => u.id !== id);
  localStorage.setItem(USERS_KEY, JSON.stringify(updated));
}

export function getCurrentUser(): User | null {
  const session = localStorage.getItem(SESSION_KEY);
  return session ? JSON.parse(session) : null;
}

export function login(username: string, password?: string): User | null {
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  
  // If user exists and password is required, check it
  if (user && (!user.password || user.password === password)) {
    const { password: _, ...sessionUser } = user; // Don't store password in session
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    return user;
  }
  return null;
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}
