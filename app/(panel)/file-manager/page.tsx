import { Suspense } from "react";
import type { Metadata } from "next";
import FileManager from "@/components/file-manager/FileManager";

export const metadata: Metadata = {
  title: "File Manager — clau-ai",
};

export default function FileManagerPage() {
  // FileManager reads ?path= from the URL, which requires a Suspense boundary
  return (
    <Suspense>
      <FileManager />
    </Suspense>
  );
}
