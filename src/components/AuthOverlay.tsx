import React from 'react';
import { Button } from './ui/button';
import { Shield, Lock } from 'lucide-react';

interface AuthOverlayProps {
  onSignIn: () => void;
}

export const AuthOverlay: React.FC<AuthOverlayProps> = ({ onSignIn }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
      <div className="max-w-md w-full p-10 bg-card border-2 border-border rounded-3xl shadow-2xl text-center fancy-shadow">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
          <Shield className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-heading italic text-foreground mb-3">Regulatory Access</h2>
        <p className="text-muted-foreground text-sm mb-10 leading-relaxed">
          Please sign in to access the CRR × PS01/2026 Lookup Engine and manage your regulatory search history.
        </p>
        <Button 
          onClick={onSignIn}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold py-7 rounded-2xl shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
        >
          <Lock className="w-5 h-5 mr-3" /> Sign in with Google
        </Button>
        <div className="mt-8 text-[11px] text-muted-foreground uppercase tracking-widest font-bold opacity-50">
          Secure Prudential Analysis Environment
        </div>
      </div>
    </div>
  );
};
