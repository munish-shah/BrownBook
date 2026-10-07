import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="boot">
                <div className="boot-error">
                    <b>Something went wrong.</b>
                    <p>Your data is safe — it is saved separately from this screen. Reloading usually fixes it.</p>
                    <button className="secondary" onClick={() => location.reload()}>Reload</button>
                </div>
            </div>
        );
    }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
