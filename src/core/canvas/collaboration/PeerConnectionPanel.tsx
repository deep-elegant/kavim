import React, { useState } from 'react';
import { useWebRTC } from './WebRTCContext';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

interface PeerConnectionPanelProps {
  role: 'initiator' | 'responder';
}

export function PeerConnectionPanel({ role }: PeerConnectionPanelProps) {
  const {
    createOffer,
    setRemoteOffer,
    createAnswer,
    setRemoteAnswer,
    addCandidate,
    sendMessage,
    localOffer,
    localAnswer,
    localCandidates,
    connectionState,
    dataChannelState,
    messages,
  } = useWebRTC();

  const [remoteOfferInput, setRemoteOfferInput] = useState('');
  const [remoteAnswerInput, setRemoteAnswerInput] = useState('');
  const [remoteCandidateInput, setRemoteCandidateInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyCandidateToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCreateOffer = async () => {
    await createOffer();
  };

  const handleCreateAnswer = async () => {
    // For responder: first set the remote offer, then create answer
    if (!remoteOfferInput.trim()) {
      alert('Please paste the offer from Initiator first');
      return;
    }

    try {
      await setRemoteOffer(remoteOfferInput);
      await createAnswer();
      setRemoteOfferInput('');
    } catch (err) {
      console.error('Error creating answer:', err);
      alert('Invalid offer JSON or failed to create answer');
    }
  };

  const handleSetRemoteAnswer = async () => {
    if (!remoteAnswerInput.trim()) return;
    try {
      await setRemoteAnswer(remoteAnswerInput);
      setRemoteAnswerInput('');
    } catch (err) {
      console.error('Error setting remote answer:', err);
      alert('Invalid answer JSON');
    }
  };

  const handleAddCandidate = async () => {
    if (!remoteCandidateInput.trim()) return;
    try {
      await addCandidate(remoteCandidateInput);
      setRemoteCandidateInput('');
    } catch (err) {
      console.error('Error adding candidate:', err);
      alert('Invalid candidate JSON');
    }
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const sent = sendMessage({
      type: 'chat',
      data: chatInput,
      timestamp: Date.now(),
    });
    if (sent) {
      setChatInput('');
    }
  };

  const getConnectionStateColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'text-emerald-600';
      case 'connecting':
        return 'text-amber-600';
      case 'failed':
        return 'text-red-600';
      case 'disconnected':
        return 'text-orange-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const formatMessageData = (data: string): string => data;

  return (
    <div className="flex h-full flex-col bg-background text-foreground text-sm">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {role === 'initiator' ? '👤 Initiator' : '👤 Responder'}
          </h2>
          <div className="flex items-center gap-4">
            <span className={`text-xs ${getConnectionStateColor()}`}>
              Connection: {connectionState}
            </span>
            <span
              className={`text-xs ${
                dataChannelState === 'open' ? 'text-emerald-600' : 'text-muted-foreground'
              }`}
            >
              Channel: {dataChannelState}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="flex flex-col gap-6">
          {role === 'initiator' ? (
            /* INITIATOR VIEW */
            <>
              {/* Step 1: Create Offer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-primary">Step 1: Create Offer</h3>
                </div>
                <Button onClick={handleCreateOffer} className="w-full" size="sm">
                  Create Offer
                </Button>
                {localOffer && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">Offer (send to Responder)</label>
                      <Button
                        onClick={() => copyToClipboard(localOffer, 'offer')}
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                      >
                        {copiedField === 'offer' ? (
                          <>
                            <Check className="mr-1 h-3 w-3 text-emerald-600" />
                            <span className="text-xs text-emerald-600">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1 h-3 w-3" />
                            <span className="text-xs">Copy</span>
                          </>
                        )}
                      </Button>
                    </div>
                    <textarea
                      value={localOffer}
                      readOnly
                      className="h-32 w-full resize-none rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Step 2: Set Remote Answer */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-primary">Step 2: Paste Answer from Responder</h3>
                <textarea
                  value={remoteAnswerInput}
                  onChange={(e) => setRemoteAnswerInput(e.target.value)}
                  placeholder="Paste answer JSON here..."
                  className="h-32 w-full resize-none rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono"
                />
                <Button onClick={handleSetRemoteAnswer} className="w-full" size="sm" disabled={!remoteAnswerInput.trim()}>
                  Set Remote Answer
                </Button>
              </div>

              {/* ICE Candidates */}
              {localCandidates.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">ICE Candidates (optional - for troubleshooting)</label>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {localCandidates.map((candidate, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                          {candidate.substring(0, 60)}...
                        </code>
                        <Button
                          onClick={() => copyCandidateToClipboard(candidate, idx)}
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2"
                        >
                          {copiedIndex === idx ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* RESPONDER VIEW */
            <>
              {/* Step 1: Paste Offer and Create Answer */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-primary">Step 1: Paste Offer from Initiator</h3>
                <textarea
                  value={remoteOfferInput}
                  onChange={(e) => setRemoteOfferInput(e.target.value)}
                  placeholder="Paste offer JSON here..."
                  className="h-32 w-full resize-none rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono"
                />
                <Button
                  onClick={handleCreateAnswer}
                  className="w-full"
                  size="sm"
                  disabled={!remoteOfferInput.trim()}
                >
                  Create Answer
                </Button>
                {localAnswer && (
                  <div className="mt-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">Answer (send to Initiator)</label>
                      <Button
                        onClick={() => copyToClipboard(localAnswer, 'answer')}
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                      >
                        {copiedField === 'answer' ? (
                          <>
                            <Check className="mr-1 h-3 w-3 text-emerald-600" />
                            <span className="text-xs text-emerald-600">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1 h-3 w-3" />
                            <span className="text-xs">Copy</span>
                          </>
                        )}
                      </Button>
                    </div>
                    <textarea
                      value={localAnswer}
                      readOnly
                      className="h-32 w-full resize-none rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Add Remote Candidate (optional) */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Add Remote ICE Candidate (optional - for troubleshooting)</label>
                <textarea
                  value={remoteCandidateInput}
                  onChange={(e) => setRemoteCandidateInput(e.target.value)}
                  placeholder="Paste candidate JSON here..."
                  className="h-20 w-full resize-none rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono"
                />
                <Button
                  onClick={handleAddCandidate}
                  className="w-full"
                  size="sm"
                  variant="secondary"
                  disabled={!remoteCandidateInput.trim()}
                >
                  Add Candidate
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chat Section */}
      {dataChannelState === 'open' && (
        <div className="space-y-2 border-t border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">💬 Chat (Test Connection)</h3>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type a message..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
            <Button onClick={handleSendMessage} size="sm">
              Send
            </Button>
          </div>
          <div className="h-24 space-y-1 overflow-y-auto rounded-md border border-input bg-muted p-2">
            {messages.map((msg, idx) => (
              <div key={idx} className="text-xs text-muted-foreground">
                <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                {' - '}
                {formatMessageData(msg.data)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
