import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/login.css'; 
import logo from '../assets/images/meedo-logo.png'; 

// Import your Supabase client and the custom popup
import { supabase } from '../supabase/lib/supabase';
import LoginErrorPopup from '../components/LoginErrorPopup'; 

export default function Login() {
  const [role, setRole] = useState('');
  const [username, setUsername] = useState(''); // Cleared default for testing
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      // SMART LOGIC: If you type a real email, use it. Otherwise, add @meedo.local
      const email = username.includes('@') ? username : `${username}@meedo.local`;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        setErrorMsg(error.message);
      } else if (data.user) {
        
        // Optional Security Check: Ensure the Role they selected matches their actual account role
        const actualRole = data.user.user_metadata?.role;
        
        if (actualRole && role !== actualRole) {
           // If they select the wrong role in the dropdown, reject the login
           await supabase.auth.signOut();
           setErrorMsg(`Access Denied: You are not registered as a ${role}.`);
           return;
        }

        // Login successful! Redirect to dashboard
        navigate('/dashboard'); 
      }
    } catch (err) {
      setErrorMsg('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      
      <div className="overlay"></div>

      <div className="login-wrapper">
        <div className="login-container">
          
          <div className="login-header">
            <div className="logo">
              <img src={logo} alt="MEEDO Logo" />
            </div>
            <h2>Odiongan Public Market</h2>
            <p>Stall & Rental Monitoring System</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            
            <div className="form-group">
              <label>Role</label>
              <div className="input-box">
                <i className="fa-solid fa-user-tie"></i>
                <select 
                  name="role" 
                  required 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">Select Role</option>
                  <option value="Administrator">Administrator</option>
                  <option value="Meedo Personnel">Meedo Personnel</option>
                  <option value="Treasury">Treasury</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Username or Email</label>
              <div className="input-box">
                <i className="fa-regular fa-user"></i>
                <input 
                  type="text" 
                  name="username" 
                  placeholder="Enter username or email" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="input-box">
                <i className="fa-solid fa-lock"></i>
                <input 
                  type={showPassword ? "text" : "password"} 
                  name="password" 
                  placeholder="Enter Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                  disabled={isLoading}
                />
                <i 
                  className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} 
                  id="togglePassword" 
                  onClick={() => setShowPassword(!showPassword)}
                ></i>
              </div>
            </div>

            <div className="form-options">
              <label className="checkbox-container">
                <input 
                  type="checkbox" 
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  disabled={isLoading}
                />
                Show Password
              </label>
            </div>

            <button type="submit" className="btn-login" disabled={isLoading}>
              <i className="fa-solid fa-arrow-right-to-bracket"></i> 
              {isLoading ? ' Signing In...' : ' Sign In'}
            </button>
          </form>

          <div className="login-footer">
            <p>&copy; {new Date().getFullYear()} MEEDO System. All rights reserved.</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <LoginErrorPopup 
          message={errorMsg} 
          onClose={() => setErrorMsg('')} 
        />
      )}
    </div>
  );
}