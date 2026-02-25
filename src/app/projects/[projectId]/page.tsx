import Link from "next/link";
import { ObjectId } from "mongodb";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import BackButton from "@/components/layout/BackButton";
import Button from "@/components/ui/Button";
import ProjectDeleteButton from "@/components/projects/ProjectDeleteButton";
import MeetingCard from "@/components/meetings/MeetingCard";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

async function getProjectWithMeetings(projectId: string, userId: string) {
  const { db } = await connectToDatabase();

  const project = await db
    .collection("projects")
    .findOne({ _id: new ObjectId(projectId), userId });

  if (!project) return null;

  const meetings = await db
    .collection("meetings")
    .find({ projectId: new ObjectId(projectId), userId })
    .sort({ createdAt: -1 })
    .toArray();

  return { project, meetings };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const data = await getProjectWithMeetings(projectId, user.id);

  if (!data) notFound();

  const { project, meetings } = data;

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <BackButton href="/projects" label="프로젝트 목록" />

        <div className="flex items-start justify-between mt-4 mb-2">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.description && (
              <p className="text-muted mt-1">{project.description}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href={`/projects/${projectId}/edit`}>
              <Button variant="secondary" size="sm">
                수정
              </Button>
            </Link>
            <ProjectDeleteButton
              projectId={projectId}
              projectName={project.name}
            />
          </div>
        </div>

        <hr className="my-6 border-border" />

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">회의록</h2>
          <Link href={`/projects/${projectId}/meetings/new`}>
            <Button>
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              새 회의
            </Button>
          </Link>
        </div>

        {meetings.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            <p className="text-lg mb-2">아직 회의록이 없습니다</p>
            <p className="text-sm">새 회의를 시작하여 녹음해 보세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <MeetingCard
                key={meeting._id.toString()}
                id={meeting._id.toString()}
                projectId={projectId}
                title={meeting.title}
                overview={meeting.summary?.overview}
                status={meeting.status}
                createdAt={meeting.createdAt}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
