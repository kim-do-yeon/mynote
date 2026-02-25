import { ObjectId } from "mongodb";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import BackButton from "@/components/layout/BackButton";
import ProjectForm from "@/components/projects/ProjectForm";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

async function getProject(projectId: string, userId: string) {
  const { db } = await connectToDatabase();
  return db.collection("projects").findOne({ _id: new ObjectId(projectId), userId });
}

export default async function EditProjectPage({
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
        <BackButton href={`/projects/${projectId}`} label="프로젝트" />
        <h1 className="text-2xl font-bold mt-4 mb-6">프로젝트 수정</h1>
        <ProjectForm
          projectId={projectId}
          initialData={{
            name: project.name,
            description: project.description,
          }}
        />
      </main>
    </>
  );
}
