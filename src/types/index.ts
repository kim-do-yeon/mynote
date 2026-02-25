import { ObjectId } from "mongodb";

export interface Project {
  _id: ObjectId;
  userId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectFormData {
  name: string;
  description?: string;
}

export interface ActionItem {
  task: string;
  assignee: string;
  deadline: string;
}

export interface MeetingSummary {
  overview: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  participants: string[];
}

export type MeetingStatus =
  | "recording"
  | "transcribing"
  | "summarizing"
  | "completed"
  | "error";

export interface Meeting {
  _id: ObjectId;
  userId: string;
  projectId: ObjectId;
  title: string;
  transcript: string;
  summary: MeetingSummary;
  status: MeetingStatus;
  audioDuration?: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TranscribeRequest {
  audioBase64: string;
  audioFormat: string;
  projectId: string;
}

export interface TranscribeResponse {
  meetingId: string;
  transcript: string;
  summary: MeetingSummary;
  title: string;
}

export interface ApiError {
  error: string;
}
