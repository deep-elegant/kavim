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
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'failed': return 'text-red-500';
      case 'disconnected': return 'text-orange-500';
      default: return 'text-gray-500';
    }
  };

  const formatMessageData = (data: string | { x: number; y: number }): string => {
    if (typeof data === 'string') return data;
    return `Mouse: (${data.x}, ${data.y})`;
  };

  return (
    <div className="flex h-full flex-col bg-gray-900 text-gray-100 font-mono text-sm">
      {/* Header */}
      <div className="border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {role === 'initiator' ? '👤 Initiator' : '👤 Responder'}
          </h2>
          <div className="flex items-center gap-4">
            <span className={`text-xs ${getConnectionStateColor()}`}>
              Connection: {connectionState}
            </span>
            <span className={`text-xs ${dataChannelState === 'open' ? 'text-green-500' : 'text-gray-500'}`}>
              Channel: {dataChannelState}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {role === 'initiator' ? (
          /* INITIATOR VIEW */
          <>
            {/* Step 1: Create Offer */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-blue-400">Step 1: Create Offer</h3>
              </div>
              <Button 
                onClick={handleCreateOffer} 
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="sm"
              >
                Create Offer
              </Button>
              {localOffer && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">Offer (send to Responder)</label>
                    <Button
                      onClick={() => copyToClipboard(localOffer, 'offer')}
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                    >
                      {copiedField === 'offer' ? (
                        <>
                          <Check className="h-3 w-3 text-green-500 mr-1" />
                          <span className="text-xs text-green-500">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          <span className="text-xs">Copy</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <textarea
                    value={localOffer}
                    readOnly
                    className="w-full h-32 bg-gray-800 border border-gray-600 rounded p-2 text-xs resize-none font-mono"
                  />
                </div>
              )}
            </div>

            {/* Step 2: Set Remote Answer */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-blue-400">Step 2: Paste Answer from Responder</h3>
              <textarea
                value={remoteAnswerInput}
                onChange={(e) => setRemoteAnswerInput(e.target.value)}
                placeholder="Paste answer JSON here..."
                className="w-full h-32 bg-gray-800 border border-gray-600 rounded p-2 text-xs resize-none font-mono"
              />
              <Button 
                onClick={handleSetRemoteAnswer} 
                className="w-full bg-green-600 hover:bg-green-700"
                size="sm"
                disabled={!remoteAnswerInput.trim()}
              >
                Set Remote Answer
              </Button>
            </div>

            {/* ICE Candidates */}
            {localCandidates.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-gray-400">ICE Candidates (optional - for troubleshooting)</label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {localCandidates.map((candidate, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-gray-800 p-1 rounded truncate">
                        {candidate.substring(0, 60)}...
                      </code>
                      <Button
                        onClick={() => copyCandidateToClipboard(candidate, idx)}
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                      >
                        {copiedIndex === idx ? (
                          <Check className="h-3 w-3 text-green-500" />
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
              <h3 className="text-sm font-semibold text-purple-400">Step 1: Paste Offer from Initiator</h3>
              <textarea
                value={remoteOfferInput}
                onChange={(e) => setRemoteOfferInput(e.target.value)}
                placeholder="Paste offer JSON here..."
                className="w-full h-32 bg-gray-800 border border-gray-600 rounded p-2 text-xs resize-none font-mono"
              />
              <Button 
                onClick={handleCreateAnswer} 
                className="w-full bg-purple-600 hover:bg-purple-700"
                size="sm"
                disabled={!remoteOfferInput.trim()}
              >
                Create Answer
              </Button>
              {localAnswer && (
                <div className="space-y-1 mt-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">Answer (send to Initiator)</label>
                    <Button
                      onClick={() => copyToClipboard(localAnswer, 'answer')}
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                    >
                      {copiedField === 'answer' ? (
                        <>
                          <Check className="h-3 w-3 text-green-500 mr-1" />
                          <span className="text-xs text-green-500">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          <span className="text-xs">Copy</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <textarea
                    value={localAnswer}
                    readOnly
                    className="w-full h-32 bg-gray-800 border border-gray-600 rounded p-2 text-xs resize-none font-mono"
                  />
                </div>
              )}
            </div>

            {/* Add Remote Candidate (optional) */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400">Add Remote ICE Candidate (optional - for troubleshooting)</label>
              <textarea
                value={remoteCandidateInput}
                onChange={(e) => setRemoteCandidateInput(e.target.value)}
                placeholder="Paste candidate JSON here..."
                className="w-full h-20 bg-gray-800 border border-gray-600 rounded p-2 text-xs resize-none font-mono"
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

      {/* Chat Section */}
      {dataChannelState === 'open' && (
        <div className="border-t border-gray-700 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400">💬 Chat (Test Connection)</h3>
            <Button 
              onClick={() => {
                const testX = Math.floor(Math.random() * 800);
                const testY = Math.floor(Math.random() * 600);
                sendMessage({
                  type: 'mouse',
                  data: { x: testX, y: testY },
                  timestamp: Date.now(),
                });
                console.log('🧪 Test mouse sent:', { x: testX, y: testY });
              }}
              size="sm"
              variant="outline"
              className="h-6 text-xs"
            >
              Test Mouse
            </Button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type a message..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm"
            />
            <Button onClick={handleSendMessage} size="sm">
              Send
            </Button>
          </div>
          <div className="h-24 overflow-y-auto bg-gray-800 rounded p-2 space-y-1">
            {messages.map((msg, idx) => (
              <div key={idx} className="text-xs text-gray-300">
                <span className="text-gray-500">{new Date(msg.timestamp).toLocaleTimeString()}</span>
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
