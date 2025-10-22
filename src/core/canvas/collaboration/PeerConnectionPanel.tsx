import React, { useState } from "react";
import { useWebRTC } from "./WebRTCContext";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface PeerConnectionPanelProps {
  role: "initiator" | "responder";
}

/**
 * Manual WebRTC connection panel with step-by-step UI.
 * - Initiator: creates offer → receives answer → exchanges ICE candidates
 * - Responder: receives offer → creates answer → exchanges ICE candidates
 * - No signaling server: users copy/paste connection data manually
 */
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

  // Local input state for pasting remote connection data
  const [remoteOfferInput, setRemoteOfferInput] = useState("");
  const [remoteAnswerInput, setRemoteAnswerInput] = useState("");
  const [remoteCandidateInput, setRemoteCandidateInput] = useState("");
  const [chatInput, setChatInput] = useState("");

  // UI feedback for copy actions
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Copy helpers with temporary UI feedback
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const copyCandidateToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleCreateOffer = async () => {
    await createOffer();
  };

  /**
   * Responder flow: must receive offer before creating answer.
   * - Validates input to prevent confusing error states
   */
  const handleCreateAnswer = async () => {
    if (!remoteOfferInput.trim()) {
      alert("Please paste the offer from Initiator first");
      return;
    }

    try {
      await setRemoteOffer(remoteOfferInput);
      await createAnswer();
      setRemoteOfferInput("");
    } catch (err) {
      console.error("Error creating answer:", err);
      alert("Invalid offer JSON or failed to create answer");
    }
  };

  const handleSetRemoteAnswer = async () => {
    if (!remoteAnswerInput.trim()) return;
    try {
      await setRemoteAnswer(remoteAnswerInput);
      setRemoteAnswerInput("");
    } catch (err) {
      console.error("Error setting remote answer:", err);
      alert("Invalid answer JSON");
    }
  };

  const handleAddCandidate = async () => {
    if (!remoteCandidateInput.trim()) return;
    try {
      await addCandidate(remoteCandidateInput);
      setRemoteCandidateInput("");
    } catch (err) {
      console.error("Error adding candidate:", err);
      alert("Invalid candidate JSON");
    }
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const sent = sendMessage({
      type: "chat",
      data: chatInput,
      timestamp: Date.now(),
    });
    if (sent) {
      setChatInput("");
    }
  };

  /**
   * Visual feedback for connection health.
   * - Green: connected and ready
   * - Amber: attempting connection
   * - Red/orange: connection issues
   */
  const getConnectionStateColor = () => {
    switch (connectionState) {
      case "connected":
        return "text-emerald-600";
      case "connecting":
        return "text-amber-600";
      case "failed":
        return "text-red-600";
      case "disconnected":
        return "text-orange-600";
      default:
        return "text-muted-foreground";
    }
  };

  const formatMessageData = (data: string): string => data;

  return (
    <div className="bg-background text-foreground flex h-full flex-col text-sm">
      {/* Header */}
      <div className="border-border border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {role === "initiator" ? "👤 Initiator" : "👤 Responder"}
          </h2>
          <div className="flex items-center gap-4">
            <span className={`text-xs ${getConnectionStateColor()}`}>
              Connection: {connectionState}
            </span>
            <span
              className={`text-xs ${
                dataChannelState === "open"
                  ? "text-emerald-600"
                  : "text-muted-foreground"
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
          {role === "initiator" ? (
            /* INITIATOR VIEW */
            <>
              {/* Step 1: Create Offer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-primary text-sm font-semibold">
                    Step 1: Create Offer
                  </h3>
                </div>
                <Button
                  onClick={handleCreateOffer}
                  className="w-full"
                  size="sm"
                >
                  Create Offer
                </Button>
                {localOffer && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-muted-foreground text-xs">
                        Offer (send to Responder)
                      </label>
                      <Button
                        onClick={() => copyToClipboard(localOffer, "offer")}
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                      >
                        {copiedField === "offer" ? (
                          <>
                            <Check className="mr-1 h-3 w-3 text-emerald-600" />
                            <span className="text-xs text-emerald-600">
                              Copied!
                            </span>
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
                      className="border-input bg-muted h-32 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Step 2: Set Remote Answer */}
              <div className="space-y-2">
                <h3 className="text-primary text-sm font-semibold">
                  Step 2: Paste Answer from Responder
                </h3>
                <textarea
                  value={remoteAnswerInput}
                  onChange={(e) => setRemoteAnswerInput(e.target.value)}
                  placeholder="Paste answer JSON here..."
                  className="border-input bg-muted h-32 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs"
                />
                <Button
                  onClick={handleSetRemoteAnswer}
                  className="w-full"
                  size="sm"
                  disabled={!remoteAnswerInput.trim()}
                >
                  Set Remote Answer
                </Button>
              </div>

              {/* ICE Candidates */}
              {localCandidates.length > 0 && (
                <div className="space-y-2">
                  <label className="text-muted-foreground text-xs">
                    ICE Candidates (optional - for troubleshooting)
                  </label>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {localCandidates.map((candidate, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <code className="bg-muted flex-1 truncate rounded px-2 py-1 text-xs">
                          {candidate.substring(0, 60)}...
                        </code>
                        <Button
                          onClick={() =>
                            copyCandidateToClipboard(candidate, idx)
                          }
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
                <h3 className="text-primary text-sm font-semibold">
                  Step 1: Paste Offer from Initiator
                </h3>
                <textarea
                  value={remoteOfferInput}
                  onChange={(e) => setRemoteOfferInput(e.target.value)}
                  placeholder="Paste offer JSON here..."
                  className="border-input bg-muted h-32 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs"
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
                      <label className="text-muted-foreground text-xs">
                        Answer (send to Initiator)
                      </label>
                      <Button
                        onClick={() => copyToClipboard(localAnswer, "answer")}
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                      >
                        {copiedField === "answer" ? (
                          <>
                            <Check className="mr-1 h-3 w-3 text-emerald-600" />
                            <span className="text-xs text-emerald-600">
                              Copied!
                            </span>
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
                      className="border-input bg-muted h-32 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Add Remote Candidate (optional) */}
              <div className="space-y-2">
                <label className="text-muted-foreground text-xs">
                  Add Remote ICE Candidate (optional - for troubleshooting)
                </label>
                <textarea
                  value={remoteCandidateInput}
                  onChange={(e) => setRemoteCandidateInput(e.target.value)}
                  placeholder="Paste candidate JSON here..."
                  className="border-input bg-muted h-20 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs"
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
      {dataChannelState === "open" && (
        <div className="border-border space-y-2 border-t px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-muted-foreground text-sm font-semibold">
              💬 Chat (Test Connection)
            </h3>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type a message..."
              className="border-input bg-background flex-1 rounded-md border px-3 py-1 text-sm"
            />
            <Button onClick={handleSendMessage} size="sm">
              Send
            </Button>
          </div>
          <div className="border-input bg-muted h-24 space-y-1 overflow-y-auto rounded-md border p-2">
            {messages.map((msg, idx) => (
              <div key={idx} className="text-muted-foreground text-xs">
                <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                {" - "}
                {formatMessageData(msg.data)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
