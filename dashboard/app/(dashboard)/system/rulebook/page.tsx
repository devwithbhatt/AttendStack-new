"use client";

import React, { useState, useEffect } from "react";
import { Card, Form, Button, Spinner, Alert } from "react-bootstrap";
import {
  IconBook,
  IconDeviceFloppy,
  IconRefresh,
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconList,
  IconListNumbers,
} from "@tabler/icons-react";
import Swal from "sweetalert2";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("authToken");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

const MenuBar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) {
    return null;
  }

  const menuItems = [
    {
      icon: IconBold,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive("bold"),
      label: "Bold",
    },
    {
      icon: IconItalic,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive("italic"),
      label: "Italic",
    },
    {
      icon: IconUnderline,
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive("underline"),
      label: "Underline",
    },
    {
      icon: IconStrikethrough,
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive("strike"),
      label: "Strikethrough",
    },
    {
      icon: IconList,
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive("bulletList"),
      label: "Bullet List",
    },
    {
      icon: IconListNumbers,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive("orderedList"),
      label: "Ordered List",
    },
  ];

  return (
    <div className="border rounded-top p-2 d-flex gap-1 bg-light">
      {menuItems.map((item, index) => (
        <Button
          key={index}
          onClick={item.action}
          variant={item.isActive ? "primary" : "light"}
          size="sm"
          aria-label={item.label}
        >
          <item.icon size={16} />
        </Button>
      ))}
    </div>
  );
};

const RulebookPage = () => {
  const [rules, setRules] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: rules,
    editorProps: {
      attributes: {
        class: "border p-3 rounded-bottom",
        style: "min-height: 300px; outline: none;",
      },
    },
    onUpdate: ({ editor }: { editor: Editor }) => {
      setRules(editor.getHTML());
    },
  });

  const fetchRules = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/settings/`,
        {
          headers: authHeaders(),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const fetchedRules = data.attendance_rules || "";
        setRules(fetchedRules);
        if (editor) {
          editor.commands.setContent(fetchedRules);
        }
      } else {
        throw new Error("Failed to fetch rules. Please try again.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRules = async () => {
    setIsSaving(true);
    setError("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/settings/`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ attendance_rules: rules }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || "Failed to save rules.");
      }

      Swal.fire({
        icon: "success",
        title: "Rules Updated",
        text: "The company rulebook has been successfully updated.",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Save Failed",
        text: err instanceof Error ? err.message : "An unknown error occurred.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  useEffect(() => {
    if (editor && !isLoading && rules !== editor.getHTML()) {
      editor.commands.setContent(rules);
    }
  }, [rules, editor, isLoading]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="fw-bold">Company Rulebook</h2>
        <p className="text-secondary">
          Manage and update the official company-wide attendance and conduct
          rules.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <Card.Header className="p-3 bg-white border-bottom-0">
          <h5 className="mb-0 d-flex align-items-center gap-2">
            <IconBook size={20} />
            Attendance & Conduct Rules
          </h5>
        </Card.Header>
        <Card.Body>
          {isLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading Rules...</span>
              </Spinner>
              <p className="mt-2 text-secondary">Loading rulebook...</p>
            </div>
          ) : error ? (
            <Alert variant="danger">{error}</Alert>
          ) : (
            <div>
              <MenuBar editor={editor} />
              <EditorContent editor={editor} />
            </div>
          )}
        </Card.Body>
        <Card.Footer className="text-end bg-light p-3">
          <Button
            variant="secondary"
            onClick={fetchRules}
            disabled={isLoading || isSaving}
            className="me-2"
          >
            <IconRefresh size={16} className="me-1" />
            Reload
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveRules}
            disabled={isLoading || isSaving || !editor}
          >
            {isSaving ? (
              <>
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="me-1"
                />
                Saving...
              </>
            ) : (
              <>
                <IconDeviceFloppy size={16} className="me-1" />
                Save Rules
              </>
            )}
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
};

export default RulebookPage;