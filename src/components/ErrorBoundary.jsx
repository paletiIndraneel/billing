import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // In production an error reporting service would go here
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { error, info } = this.state;
    const { label = 'this section' } = this.props;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 320, gap: '1rem', padding: '2rem', textAlign: 'center'
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)', display: 'flex',
          alignItems: 'center', justifyContent: 'center'
        }}>
          <AlertTriangle size={28} color="var(--danger, #ef4444)" />
        </div>
        <div>
          <h2 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: 420 }}>
            An unexpected error occurred in {label}. Your data is safe — this is a display error only.
          </p>
        </div>
        <details style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 560, textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Technical details</summary>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-color, #f9fafb)', padding: '0.75rem', borderRadius: 6 }}>
            {error?.message}
            {info?.componentStack}
          </pre>
        </details>
        <button
          className="btn btn-primary"
          onClick={() => this.setState({ error: null, info: null })}
        >
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    );
  }
}
