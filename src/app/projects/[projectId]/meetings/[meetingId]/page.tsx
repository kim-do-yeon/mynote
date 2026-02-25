import Link from "next/link";
import { ObjectId } from "mongodb";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import BackButton from "@/components/layout/BackButton";
import Button from "@/components/ui/Button";
import MeetingDetail from "@/components/meetings/MeetingDetail";
import MeetingDeleteButton from "@/components/meetings/MeetingDeleteButton";
import { connectToDatabase } from "@/lib/mongodb";
import { formatDateTimeFull } from "@/lib/date-utils";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

async function getMeeting(meetingId: string, userId: string) {
  const { db } = await connectToDatabase();
  return db.collection("meetings").findOne({ _id: new ObjectId(meetingId), userId });
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; meetingId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { projectId, meetingId } = await params;
  const meeting = await getMeeting(meetingId, user.id);

  if (!meeting) notFound();

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <BackButton href={`/projects/${projectId}`} label="프로젝트" />

        <div className="flex items-start justify-between mt-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">{meeting.title}</h1>
            <p className="text-sm text-muted mt-1">
              {formatDateTimeFull(new Date(meeting.createdAt))}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href={`/projects/${projectId}/meetings/${meetingId}/edit`}
            >
              <Button variant="secondary" size="sm">
                수정
              </Button>
            </Link>
            <MeetingDeleteButton
              meetingId={meetingId}
              projectId={projectId}
            />
          </div>
        </div>

        <MeetingDetail
          summary={meeting.summary}
          transcript={meeting.transcript}
        />
      </main>
    </>
  );
}
