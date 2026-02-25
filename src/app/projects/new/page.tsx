import Header from "@/components/layout/Header";
import BackButton from "@/components/layout/BackButton";
import ProjectForm from "@/components/projects/ProjectForm";

export default function NewProjectPage() {
  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <BackButton href="/projects" label="프로젝트 목록" />
        <h1 className="text-2xl font-bold mt-4 mb-6">새 프로젝트</h1>
        <ProjectForm />
      </main>
    </>
  );
}
