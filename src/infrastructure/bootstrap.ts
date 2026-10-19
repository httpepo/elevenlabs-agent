import "server-only";
import { createLeadUseCases } from "../modules/leads/application/create-lead.ts";
import { GetBriefingUseCase, GetResearchStatusUseCase } from "../modules/research/application/get-briefing-use-case.ts";
import { RunResearchUseCase } from "../modules/research/application/run-research-use-case.ts";
import { StartResearchUseCase } from "../modules/research/application/start-research-use-case.ts";
import { TavilySearchAdapter } from "./providers/research/tavily-search-adapter.ts";
import { GeminiBriefingAdapter } from "./providers/research/gemini-briefing-adapter.ts";
import { leadStore as fileLeadStore } from "./db/file-lead-repository.ts";
import { NeonLeadRepository } from "./db/neon-lead-repository.ts";
import { fileResearchRepository } from "./db/file-research-repository.ts";
import { NeonResearchRepository } from "./db/neon-research-repository.ts";
import { FileResearchQueue } from "./jobs/file-research-queue.ts";
import { NeonJobQueue } from "./jobs/neon-job-queue.ts";
import { PrepareVoiceSessionUseCase } from "../modules/conversation/application/prepare-voice-session.ts";
import { ProcessVoiceSessionEventUseCase } from "../modules/conversation/application/process-voice-session-event.ts";
import { GetVoiceSessionStatusUseCase } from "../modules/conversation/application/get-voice-session-status.ts";
import { ProcessCallWebhookUseCase } from "../modules/conversation/application/process-call-webhook.ts";
import { fileConversationRepository } from "./db/file-conversation-repository.ts";
import { neonConversationRepository } from "./db/neon-conversation-repository.ts";
import { ElevenLabsVoiceProvider } from "./providers/elevenlabs/elevenlabs-voice-provider.ts";
import { ElevenLabsWebhookVerifier } from "./security/elevenlabs-webhook.ts";
import { EnvironmentLeadSessionCredentialVerifier } from "./security/lead-session.ts";
import { ExtractSpicedQualificationUseCase } from "../modules/qualification/application/use-cases/extract-spiced-qualification.ts";
import { GeminiQualificationAdapter } from "./providers/qualification/gemini-qualification-adapter.ts";
import { fileQualificationRepository } from "./db/file-qualification-repository.ts";
import { NeonQualificationRepository } from "./db/neon-qualification-repository.ts";
import { GetSpicedQualificationUseCase } from "../modules/qualification/application/use-cases/get-spiced-qualification.ts";
import { GetAvailabilityUseCase } from "../modules/scheduling/application/use-cases/get-availability.ts";
import { BookMeetingUseCase } from "../modules/scheduling/application/use-cases/book-meeting.ts";
import { GetMeetingAttemptsUseCase } from "../modules/scheduling/application/use-cases/get-meeting-attempts.ts";
import { LazyCalendarProvider } from "./providers/calendar/http-calendar-provider.ts";
import { fileMeetingAttemptRepository, neonMeetingAttemptRepository } from "./db/meeting-attempt-repository.ts";
import { slotOfferTokenService } from "./security/slot-offer-token.ts";
import { GetLeadAuditSummaryUseCase } from "../modules/audit/application/use-cases/get-lead-audit-summary.ts";
import { ListAttendanceOverviewUseCase } from "../modules/audit/application/use-cases/list-attendance-overview.ts";
import { fileAuditRepository } from "./db/repositories/file-audit-repository.ts";
import { neonAuditRepository } from "./db/repositories/neon-audit-repository.ts";
import { DeploymentAccess } from "./security/deployment-access.ts";
import { HmacVoiceToolCredentialService } from "./security/voice-tool-credential.ts";
import { ProcessResearchJob } from "../modules/research/application/process-research-job.ts";
import { VercelResearchQueue, createResearchConsumer } from "./jobs/vercel-research-queue.ts";
import { VercelConversationProcessingQueue, createConversationConsumer } from "./jobs/vercel-conversation-queue.ts";

export { issueLeadSessionCookie, readLeadSessionCredential } from "./security/lead-session.ts";

const useNeonPersistence = Boolean(process.env.DATABASE_URL?.trim());
const leadStore = useNeonPersistence ? new NeonLeadRepository() : fileLeadStore;
const voiceToolCredentials = new HmacVoiceToolCredentialService();
export const deploymentAccess = new DeploymentAccess(leadStore, voiceToolCredentials);
const researchRepository = useNeonPersistence ? new NeonResearchRepository() : fileResearchRepository;
const jobQueue = useNeonPersistence ? new NeonJobQueue(researchRepository) : new FileResearchQueue(researchRepository);
const researchProvider = new TavilySearchAdapter();
const briefingGenerator = new GeminiBriefingAdapter();
const researchQueue = process.env.VERCEL === "1" && useNeonPersistence
  ? new VercelResearchQueue(jobQueue)
  : jobQueue;
const runResearch = new RunResearchUseCase(leadStore, researchRepository, researchProvider, briefingGenerator);
const processResearchJob = new ProcessResearchJob(jobQueue, researchRepository, runResearch);

export const researchRuntime = {
  researchRepository,
  researchQueue,
  jobQueue,
  startResearch: new StartResearchUseCase(leadStore, researchRepository, researchQueue),
  runResearch,
  consumeResearchMessage: createResearchConsumer(processResearchJob),
  getBriefing: new GetBriefingUseCase(leadStore, researchRepository),
  getResearchStatus: new GetResearchStatusUseCase(leadStore, researchRepository),
};

const conversationRepository = useNeonPersistence ? neonConversationRepository : fileConversationRepository;
const qualificationRepository = useNeonPersistence ? new NeonQualificationRepository() : fileQualificationRepository;
const qualificationExtractor = new GeminiQualificationAdapter();
const extractSpicedQualification = new ExtractSpicedQualificationUseCase(
  leadStore,
  qualificationExtractor,
  qualificationRepository,
  qualificationRepository,
  qualificationRepository,
);
const leadSessionCredentialVerifier = new EnvironmentLeadSessionCredentialVerifier();
const voiceProvider = new ElevenLabsVoiceProvider();
const webhookVerifier = new ElevenLabsWebhookVerifier();
const conversationProcessingQueue = process.env.VERCEL === "1" && useNeonPersistence
  ? new VercelConversationProcessingQueue()
  : undefined;
const processCallWebhook = new ProcessCallWebhookUseCase(webhookVerifier, conversationRepository, conversationRepository, conversationRepository, extractSpicedQualification, conversationProcessingQueue);

export const conversationRuntime = {
  conversationRepository,
  prepareVoiceSession: new PrepareVoiceSessionUseCase(
    leadStore,
    researchRepository,
    conversationRepository,
    voiceProvider,
    leadSessionCredentialVerifier,
    conversationRepository,
    voiceToolCredentials,
  ),
  processBrowserEvent: new ProcessVoiceSessionEventUseCase(leadStore, conversationRepository, leadSessionCredentialVerifier),
  getVoiceSessionStatus: new GetVoiceSessionStatusUseCase(leadStore, conversationRepository, leadSessionCredentialVerifier),
  processCallWebhook,
  consumeProcessingMessage: createConversationConsumer((job) => processCallWebhook.executeQueued(job)),
};

export const qualificationRuntime = {
  qualificationRepository,
  extractSpicedQualification,
  getSpicedQualification: new GetSpicedQualificationUseCase(leadStore, qualificationRepository),
};

const meetingAttemptRepository = useNeonPersistence ? neonMeetingAttemptRepository : fileMeetingAttemptRepository;
const calendarProvider = new LazyCalendarProvider();
const getAvailability = new GetAvailabilityUseCase(
  leadStore,
  conversationRepository,
  calendarProvider,
  meetingAttemptRepository,
  slotOfferTokenService,
  conversationRepository,
);

export const calendarRuntime = {
  meetingAttemptRepository,
  getAvailability,
  bookMeeting: new BookMeetingUseCase(
    leadStore,
    conversationRepository,
    calendarProvider,
    meetingAttemptRepository,
    slotOfferTokenService,
    conversationRepository,
    getAvailability,
  ),
  getMeetingAttempts: new GetMeetingAttemptsUseCase(meetingAttemptRepository),
};

const auditRepository = useNeonPersistence ? neonAuditRepository : fileAuditRepository;

export const auditRuntime = {
  auditRepository,
  getLeadAuditSummary: new GetLeadAuditSummaryUseCase(
    leadStore,
    researchRepository,
    conversationRepository,
    conversationRepository,
    qualificationRepository,
    qualificationRepository,
    meetingAttemptRepository,
    auditRepository,
  ),
  listAttendanceOverview: new ListAttendanceOverviewUseCase(
    leadStore,
    researchRepository,
    conversationRepository,
    qualificationRepository,
    meetingAttemptRepository,
  ),
};

// Composition root: único ponto de ligação entre casos de uso e adaptadores.
export const demoLeads = createLeadUseCases(leadStore, researchRuntime.researchQueue);
