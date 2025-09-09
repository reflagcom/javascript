#!/bin/sh

set -e

typedoc --treatWarningsAsErrors

# We need to fix the links in the generated markdown files.
# Typedoc generates anchors for properties in tables which can collide with anchors for types.
# For example we can have property `logger` and type `Logger` which will both have anchor `logger`.
# typedoc-plugin-markdown will generate links trying to deduplicate the anchors by adding a number at the end.
# Example: `globals.md#logger-1` and `globals.md#logger-2`.
#
# We don't need the anchors for properties in the markdown files 
# and they won't even work in Gitbook because they are generated as html <a> anchors.
# We can fix this by removing the number at the end of the anchor.
SEDCOMMAND='s/globals.md#(.*)-[0-9]+/globals.md#\1/g'

# Find all markdown files including globals.md
FILES=$(find dist/docs/@reflag -name "*.md")

echo "Processing markdown files..."
for file in $FILES
do
  echo "Processing $file..."

  # Fix anchor links in globals.md files
  if [[ "$file" == *"globals.md" ]]; then
    sed -r "$SEDCOMMAND" "$file" > "$file.fixed"
    rm "$file"
    mv "$file.fixed" "$file"
  fi

  # Create a temporary file for processing
  tmp_file="${file}.tmp"

  # Process NOTE blocks - handle multi-line
  awk '
    BEGIN { in_block = 0; content = ""; }
    /^> \[!NOTE\]/ { in_block = 1; print "{% hint style=\"info\" %}"; next; }
    /^> \[!TIP\]/ { in_block = 1; print "{% hint style=\"success\" %}"; next; }
    /^> \[!IMPORTANT\]/ { in_block = 1; print "{% hint style=\"warning\" %}"; next; }
    /^> \[!WARNING\]/ { in_block = 1; print "{% hint style=\"warning\" %}"; next; }
    /^> \[!CAUTION\]/ { in_block = 1; print "{% hint style=\"danger\" %}"; next; }
    in_block && /^>/ { 
      content = content substr($0, 3) "\n";
      next;
    }
    in_block && !/^>/ { 
      printf "%s", content;
      print "{% endhint %}";
      in_block = 0;
      content = "";
    }
    !in_block { print; }
  ' "$file" > "$tmp_file"

  mv "$tmp_file" "$file"
done

echo "Processing complete!"
