from fastmcp import FastMCP
import os
from pydantic import ValidationError
import re
import sys
from typing import Annotated


# Custom error class
class CustomError(ValueError):
    """Custom error for filesystem operations."""

    pass


# Global mappings for directory access
_allowed_real_dirs: list[str] = []  # Real file system paths
_virtual_to_real: dict[str, str] = {}  # Virtual path -> Real path
_real_to_virtual: dict[str, str] = {}  # Real path -> Virtual path


def set_allowed_dirs(real_dirs: list[str]) -> None:
    """Configure allowed real directories and map them to virtual paths (e.g., /data/a)."""
    global _allowed_real_dirs, _virtual_to_real, _real_to_virtual
    _allowed_real_dirs = [os.path.abspath(os.path.expanduser(d)) for d in real_dirs]
    _virtual_to_real = {f"/data/{chr(97 + i)}": real_dir for i, real_dir in enumerate(_allowed_real_dirs)}
    _real_to_virtual = {real_dir: virtual_dir for virtual_dir, real_dir in _virtual_to_real.items()}


def validate_virtual_path(virtual_path: str) -> str:
    """Convert a virtual path to a real path, ensuring it’s within allowed directories."""
    for virtual_dir, real_dir in _virtual_to_real.items():
        if virtual_path.startswith(virtual_dir + "/") or virtual_path == virtual_dir:
            relative = virtual_path[len(virtual_dir) :].lstrip("/")
            real_path = os.path.join(real_dir, relative) if relative else real_dir
            break
    else:
        raise CustomError(f"Not a valid path (List allowed directories for valid paths): {virtual_path}")

    real_path = os.path.normpath(os.path.abspath(real_path))
    try:
        resolved_real_path = os.path.realpath(real_path)
        if any(resolved_real_path.startswith(d + os.sep) or resolved_real_path == d for d in _allowed_real_dirs):
            return resolved_real_path
        raise PermissionError("Access denied")
    except FileNotFoundError:
        real_parent = os.path.realpath(os.path.dirname(real_path))
        if not os.path.exists(real_parent):
            raise FileNotFoundError("Parent directory not found")
        if any(real_parent.startswith(d + os.sep) or real_parent == d for d in _allowed_real_dirs):
            return real_path
        raise PermissionError("Access denied")


def get_error_message(message, virtual_path: str, e: Exception) -> str:
    """Generate a user-friendly error message using the virtual path."""
    virtual_path = virtual_path or "Unknown path"
    if isinstance(e, CustomError):
        return f"{message}: {e}"
    elif isinstance(e, FileNotFoundError):
        return f"{message}: No such file or directory: {virtual_path}"
    elif isinstance(e, PermissionError):
        return f"{message}: Permission denied: {virtual_path}"
    elif isinstance(e, IsADirectoryError):
        return f"{message}: Is a directory: {virtual_path}"
    elif isinstance(e, NotADirectoryError):
        return f"{message}: Not a directory: {virtual_path}"
    elif isinstance(e, FileExistsError):
        return f"{message}: File already exists: {virtual_path}"
    elif isinstance(e, ValidationError):
        errors = e.errors()
        error_details = "; ".join(f"{err['loc'][0]}: {err['msg']}" for err in errors)
        return f"{message}: Input validation error: {error_details}"
    elif isinstance(e, ValueError):
        return f"{message}: Invalid value: {virtual_path}"
    else:
        return f"{message}: {virtual_path}"


# Server setup
mcp = FastMCP(
    name="File System Server",
    instructions="A server that provides tools for interacting with a file system. Only some paths are accessible, therefore the allowed directores must be listed initially.",
)


@mcp.tool
def write_file(
    path: Annotated[str, "The virtual path of the file to write to. If the file exists, it will be overwritten."],
    content: Annotated[str, "The content to write to the file."],
) -> str:
    """Write or overwrite a file with the given text content."""
    try:
        real_path = validate_virtual_path(path)
        with open(real_path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Wrote to {path}"
    except Exception as e:
        return get_error_message("Error writing", path, e)


@mcp.tool
def create_directory(path: Annotated[str, "The virtual path of the directory to create. It can be nested (e.g., /data/a/new/dir)."]) -> str:
    """Create a directory, including any necessary parent directories."""
    try:
        real_path = validate_virtual_path(path)
        os.makedirs(real_path, exist_ok=True)
        return f"Created {path}"
    except Exception as e:
        return get_error_message("Error creating", path, e)


def _apply_simplified_patch(original_content: str, diff: str):
    """
    Applies a simplified patch format to a string content.
    Returns a tuple of (new_content, report_string).
    Raises CustomError if the patch cannot be applied.
    """
    warnings = []
    original_lines = original_content.splitlines()

    # Parse the diff into segments
    diff_lines = diff.strip().split("\n")
    segment_start_indices = [i for i, line in enumerate(diff_lines) if line.startswith("###")]

    if not segment_start_indices:
        raise CustomError("Invalid patch format: no segment separators '###' found.")

    segments = []
    for i in range(len(segment_start_indices)):
        start_index = segment_start_indices[i]
        end_index = len(diff_lines) if i + 1 == len(segment_start_indices) else segment_start_indices[i + 1]

        header = diff_lines[start_index]
        content = diff_lines[start_index + 1 : end_index]

        start_line_gte = None
        match = re.search(r"line >= (\d+)", header)
        if match:
            start_line_gte = int(match.group(1))

        from_lines = []
        to_lines = []

        for line in content:
            if line.startswith("-"):
                from_lines.append(line[1:])
            elif line.startswith("+"):
                to_lines.append(line[1:])
            else:
                from_lines.append(line)
                to_lines.append(line)

        segments.append(
            {
                "start_line_gte": start_line_gte,
                "from_lines": from_lines,
                "to_lines": to_lines,
            }
        )

    # Apply segments
    new_lines = original_lines[:]
    current_search_start_line = 0
    for i, segment in enumerate(segments):
        search_from = current_search_start_line
        if segment["start_line_gte"] is not None:
            if segment["start_line_gte"] >= current_search_start_line + 1:
                search_from = segment["start_line_gte"] - 1
            else:
                warnings.append(f"Warning: segment {i + 1} 'line >= {segment['start_line_gte']}' is not after previous segment end line. Ignoring.")

        found_at = -1
        # Search for the from_lines block
        if not segment["from_lines"]:  # Segment only adds lines
            found_at = search_from
        else:
            for line_idx in range(search_from, len(new_lines) - len(segment["from_lines"]) + 1):
                if new_lines[line_idx : line_idx + len(segment["from_lines"])] == segment["from_lines"]:
                    found_at = line_idx
                    break

        if found_at == -1:
            raise CustomError(f"Patch segment {i + 1} could not be applied.")

        # Apply the patch
        new_lines[found_at : found_at + len(segment["from_lines"])] = segment["to_lines"]

        current_search_start_line = found_at + len(segment["to_lines"])

    report = "Patch applied successfully."
    if warnings:
        report += "\nWarnings:\n" + "\n".join(warnings)

    return "\n".join(new_lines), report


@mcp.tool
def apply_diff(
    path: Annotated[str, "The virtual path of the file to patch."],
    diff: Annotated[str, "The simplified diff to apply to the file."],
    dry_run: Annotated[bool, "If true, only check if the patch would apply cleanly, without modifying the file."] = False,
) -> str:
    """Apply a simplified patch format to a file. The format is composed of segments separated by '###'. Each segment starts with a header line like '### ###' or '### line >= x ###'. The 'line >= x' in the header is optional and tells the patch tool to start searching for the patch location from line number x. Segments must directly follow each other without separating empty lines.
    Within each segment: Lines starting with '-' are lines to be removed. Lines starting with '+' are lines to be added. Lines starting with ' ' are context lines, which must match the original file.
    The patch is applied sequentially. Each segment is searched for and applied in order, starting from the end of the previous segment, or if line >= x is higher than the line number of the end of the previous segment, the next line to replace is searched from that line downwards.
    Example of a patch segment:
    ### line >= 3 ###
    -Beneath the velvet cloak of night so deep,
    +Under the velvet cloak of night so deep,
     Where stars like silver needles stitch the sky,
    """
    try:
        real_path = validate_virtual_path(path)
        with open(real_path, "r", encoding="utf-8") as f:
            original_content = f.read()

        new_content, report = _apply_simplified_patch(original_content, diff)

        if dry_run:
            return f"Dry run successful. {report}"
        else:
            with open(real_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            return report

    except Exception as e:
        return get_error_message("Error applying diff", path, e)


@mcp.tool
def move_file(
    source: Annotated[str, "The virtual path of the file or directory to move."],
    destination: Annotated[str, "The new virtual path for the file or directory."],
) -> str:
    """Move or rename a file or directory. This operation will fail if the destination already exists."""
    try:
        real_source = validate_virtual_path(source)
        real_destination = validate_virtual_path(destination)
        os.rename(real_source, real_destination)
        return f"Moved {source} to {destination}"
    except Exception as e:
        return get_error_message("Error moving", source, e)


# Run the server with allowed directories from command-line arguments.
if len(sys.argv) < 2:
    print("Usage: filesystem <allowed-directory> [additional-directories...]")
    sys.exit(1)
real_dirs = sys.argv[1:]
for real_dir in real_dirs:
    if not os.path.isdir(real_dir):
        print(f"Error: {real_dir} is not a directory")
        sys.exit(1)
set_allowed_dirs(real_dirs)
virtual_dirs_mapping = "\n".join(f"{v} -> {r}" for v, r in _virtual_to_real.items())
print(f"MCP Filesystem Server running on stdio\nVirtual to real directory mappings:\n{virtual_dirs_mapping}")


if __name__ == "__main__":
    mcp.run()
