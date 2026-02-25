import { ObjectId } from "mongodb";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import BackButton from "@/components/layout/BackButton";
import AudioRecorder from "@/components/audio/AudioRecorder";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

async function getProject(projectId: string, userId: string) {
  const { db } = await connectToDatabase();
  return db.collection("projects").findOne({ _id: new ObjectId(projectId), userId });
}

export default async function NewMeetingPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const project = await getProject(projectId, user.id);

  if (!project) notFound();

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <BackButton
          href={`/projects/${projectId}`}
          label={project.name}
        />
        <h1 className="text-2xl font-bold mt-4 mb-8">새 회의</h1>
        <AudioRecorder projectId={projectId} />
      </main>
    </>
  );
}
