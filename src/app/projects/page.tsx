import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import ProjectCard from "@/components/projects/ProjectCard";
import Button from "@/components/ui/Button";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

interface ProjectDoc {
  _id: { toString(): string };
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

async function getProjects(userId: string) {
  const { db } = await connectToDatabase();
  const projects = (await db
    .collection("projects")
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray()) as unknown as ProjectDoc[];

  const projectsWithCount = await Promise.all(
    projects.map(async (project) => {
      const meetingCount = await db
        .collection("meetings")
        .countDocuments({ projectId: project._id, userId });
      return { ...project, meetingCount };
    })
  );

  return projectsWithCount;
}

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const projects = await getProjects(user.id);

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">프로젝트</h1>
          <Link href="/projects/new">
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              새 프로젝트
            </Button>
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 text-muted">
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
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <p className="text-lg mb-2">아직 프로젝트가 없습니다</p>
            <p className="text-sm">새 프로젝트를 만들어 회의록을 시작하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project._id.toString()}
                id={project._id.toString()}
                name={project.name}
                description={project.description}
                meetingCount={project.meetingCount}
                updatedAt={project.updatedAt}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
