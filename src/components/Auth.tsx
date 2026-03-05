import { useState } from 'react';
import { supabase } from '../services/supabaseClient';

export const Auth = ({ onAuthSuccess }: { onAuthSuccess: () => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthSuccess();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <form onSubmit={handleAuth} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <h2 className="text-2xl font-serif font-bold mb-6">{isSignUp ? 'Sign Up' : 'Login'}</h2>
        <input type="email" placeholder="Email" className="w-full p-3 mb-4 border rounded-lg" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" className="w-full p-3 mb-4 border rounded-lg" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <button type="submit" className="w-full bg-mv-primary text-white p-3 rounded-lg font-bold" disabled={loading}>
          {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Login')}
        </button>
        <button type="button" className="w-full mt-4 text-sm text-gray-500" onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? 'Already have an account? Login' : 'Need an account? Sign Up'}
        </button>
      </form>
    </div>
  );
};
