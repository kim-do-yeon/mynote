import { ObjectId } from "mongodb";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import BackButton from "@/components/layout/BackButton";
import MeetingForm from "@/components/meetings/MeetingForm";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

async function getMeeting(meetingId: string, userId: string) {
  const { db } = await connectToDatabase();
  return db.collection("meetings").findOne({ _id: new ObjectId(meetingId), userId });
}

export default async function EditMeetingPage({
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
        <BackButton
          href={`/projects/${projectId}/meetings/${meetingId}`}
          label="회의록"
        />
        <h1 className="text-2xl font-bold mt-4 mb-6">회의록 수정</h1>
        <MeetingForm
          meetingId={meetingId}
          projectId={projectId}
          initialTitle={meeting.title}
        />
      </main>
    </>
  );
}
