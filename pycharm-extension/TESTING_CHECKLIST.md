# PyCharm Extension Testing Checklist

This document contains a comprehensive checklist to verify all features of the Robot Framework Toolkit PyCharm extension.

## Installation

1. **Install the Plugin**
   - Build: `./gradlew build`
   - Plugin location: `build/distributions/robot-framework-toolkit-1.0-SNAPSHOT.zip`
   - Install in PyCharm: `Settings → Plugins → Install Plugin from Disk`

## Feature Testing

### 1. File Creation Actions ✓

**Test: Create Robot Framework Test File**
- [ ] Right-click on any directory in Project View
- [ ] Select "Robot Framework Toolkit → Create Robot Framework Test File"
- [ ] Enter a filename (e.g., "my_test")
- [ ] Verify file is created with `.robot` extension
- [ ] Verify file contains `*** Test Cases ***` section
- [ ] Verify file opens in editor

**Test: Create Robot Framework Resource File**
- [ ] Right-click on any directory
- [ ] Select "Robot Framework Toolkit → Create Robot Framework Resource File"
- [ ] Enter a filename (e.g., "common_keywords")
- [ ] Verify file is created with `.resource` extension
- [ ] Verify file contains `*** Keywords ***` section

**Test: Create Robot Framework Variables File**
- [ ] Right-click on any directory
- [ ] Select "Robot Framework Toolkit → Create Robot Framework Variables File"
- [ ] Verify file is created with `.resource` extension
- [ ] Verify file contains `*** Variables ***` section

**Test: Create Robot Framework Locators File**
- [ ] Right-click on any directory
- [ ] Select "Robot Framework Toolkit → Create Robot Framework Locators File"
- [ ] Verify file is created with `.py` extension
- [ ] Verify file contains Python class structure

### 2. Tool Window & Import Tree Display ✓

**Test: Tool Window Opens**
- [ ] Open any `.robot` or `.resource` file
- [ ] Verify "Robot Framework Toolkit" tool window appears on the right side
- [ ] Verify tree view is visible
- [ ] Verify toolbar buttons are visible

**Test: Current Imports Section**
- [ ] Open a robot file that has existing imports
- [ ] Verify "Current Imports" section shows in tree
- [ ] Verify each import shows its type (Library, Resource, or Variables)
- [ ] Verify import paths are displayed correctly

**Test: Suggested Files Section**
- [ ] Open a robot file with keywords used in test cases
- [ ] Verify "Suggested Files" section shows files that might be needed
- [ ] Verify suggested files have ⭐ indicator
- [ ] Verify files can be checked for import

**Test: All Available Files Section**
- [ ] Verify "All Available Files" section shows all robot/resource/Python files in project
- [ ] Verify files are organized by directory structure
- [ ] Verify expand/collapse works for directories

### 3. Automatic File Change Detection ✓

**Test: Automatic Import Loading**
- [ ] Open file A.robot
- [ ] Verify imports for A.robot are shown in tree
- [ ] Switch to file B.robot
- [ ] Verify imports automatically update to show B.robot's imports
- [ ] No manual refresh needed!

**Test: Initial File Load**
- [ ] Close PyCharm
- [ ] Open PyCharm and open a .robot file
- [ ] Verify imports load automatically without clicking anything

### 4. Lock/Unlock Target File Mechanism ✓

**Test: Lock Target File**
- [ ] Open file test.robot
- [ ] Click "Lock Target" button
- [ ] Verify button changes to "Unlock"
- [ ] Verify title shows "Import Libraries & Resources (test.robot)"

**Test: Locked View While Browsing**
- [ ] With test.robot locked, right-click a file in tree
- [ ] Select "View File"
- [ ] Verify different file opens in editor
- [ ] Verify tree STILL shows test.robot's imports (locked!)
- [ ] Verify status shows "Viewing: filename.robot (locked to test.robot)"

**Test: Auto-Unlock on Return**
- [ ] With test.robot locked and viewing another file
- [ ] Click on test.robot tab in editor
- [ ] Verify extension auto-unlocks
- [ ] Verify status shows "Returned to target file - unlocked"
- [ ] Verify title removes filename

**Test: Auto-Lock When Viewing Files**
- [ ] Open test.robot (not locked)
- [ ] Right-click a file in tree → "View File"
- [ ] Verify test.robot is automatically locked
- [ ] This allows browsing without losing context!

### 5. Import Selection & Management ✓

**Test: Select Import with Checkbox**
- [ ] Find a file in the tree that has multiple import types (Library | Resource | Variables)
- [ ] Click the checkbox next to the file
- [ ] Verify dialog appears asking to select import type
- [ ] Select "Library"
- [ ] Verify checkbox is checked
- [ ] Verify " → Library" appears next to filename

**Test: Auto-Select Single Type**
- [ ] Find a .py file (only has Library type)
- [ ] Click checkbox
- [ ] Verify NO dialog appears
- [ ] Verify checkbox is checked automatically
- [ ] Verify " → Library" appears next to filename

**Test: Change Import Type**
- [ ] Select a file with "Library" type
- [ ] Click checkbox again (unchecks)
- [ ] Click checkbox again
- [ ] Select different type (e.g., "Resource")
- [ ] Verify type updates

### 6. Apply & Cancel Imports ✓

**Test: Apply Imports**
- [ ] Select 3-4 files to import
- [ ] Click "Apply Imports" button
- [ ] Verify imports are added to `*** Settings ***` section of file
- [ ] Verify status shows "Applied X imports"
- [ ] Verify tree refreshes

**Test: Cancel Pending Changes**
- [ ] Select some files to import
- [ ] Verify "Cancel" button appears (context-aware!)
- [ ] Click "Cancel"
- [ ] Verify selections are restored to original state
- [ ] Verify "Cancel" button disappears

### 7. Preview Imports Feature ✓

**Test: Preview Before Applying**
- [ ] Select multiple files to import
- [ ] Click "Preview" button
- [ ] Verify dialog shows formatted import statements
- [ ] Verify shows `*** Settings ***` section
- [ ] Verify shows count of imports in title
- [ ] Click OK to close

### 8. Search & Clear Search ✓

**Test: Search Files**
- [ ] Type text in search field (e.g., "common")
- [ ] Verify tree filters to show only matching files
- [ ] Verify "Clear" button appears next to search field

**Test: Clear Search**
- [ ] With search active
- [ ] Click "Clear" button
- [ ] Verify search field is cleared
- [ ] Verify tree shows all files again
- [ ] Verify "Clear" button disappears

### 9. Context Menu Actions ✓

**Test: View File**
- [ ] Right-click any file in tree
- [ ] Select "View File"
- [ ] Verify file opens in editor

**Test: View Keywords**
- [ ] Right-click a .robot, .resource, or .py file
- [ ] Select "View Keywords"
- [ ] Verify keyword viewer dialog opens
- [ ] Verify keywords are listed

**Test: Delete Import**
- [ ] Right-click an existing import in "Current Imports"
- [ ] Select "Delete Import"
- [ ] Confirm deletion
- [ ] Verify import is removed from file

### 10. Keyword Viewer Dialog ✓

**Test: Open Keyword Viewer**
- [ ] Right-click a file with keywords
- [ ] Select "View Keywords"
- [ ] Verify dialog shows list of keywords

**Test: Search Keywords**
- [ ] In keyword viewer, type in search field
- [ ] Verify keyword list filters in real-time
- [ ] Verify title shows "X of Y keywords"

**Test: View Keyword Details**
- [ ] Click on a keyword in the list
- [ ] Verify right panel shows:
   - Keyword name
   - Arguments (numbered list)
   - Documentation
   - Usage example with argument placeholders

**Test: Insert Keyword with Arguments**
- [ ] Select a keyword with arguments
- [ ] Click "Insert with Arguments"
- [ ] Verify keyword is inserted at cursor position
- [ ] Verify includes argument placeholders like `[arg1]    [arg2]`

**Test: Insert Keyword Name Only**
- [ ] Select a keyword
- [ ] Click "Insert Name Only"
- [ ] Verify only keyword name is inserted (no arguments)

### 11. Dynamic UI State (Context-Aware) ✓

**Test: Lock/Unlock Button Visibility**
- [ ] Verify only "Lock Target" button shows initially
- [ ] Lock a file
- [ ] Verify "Lock Target" disappears and "Unlock" appears
- [ ] Unlock
- [ ] Verify buttons switch back

**Test: Cancel Button Visibility**
- [ ] Initially, "Cancel" button should be hidden
- [ ] Select some imports
- [ ] Verify "Cancel" button appears
- [ ] Apply or cancel changes
- [ ] Verify "Cancel" button disappears

**Test: Clear Search Button Visibility**
- [ ] Initially, "Clear" button should be hidden
- [ ] Type in search field
- [ ] Verify "Clear" button appears
- [ ] Click "Clear"
- [ ] Verify button disappears

### 12. Edit Robot Imports Action ✓

**Test: Right-Click Menu Action**
- [ ] Right-click any .robot file in Project View
- [ ] Select "Robot Framework Toolkit → Edit Robot Framework Imports"
- [ ] Verify file opens in editor
- [ ] Verify tool window opens and shows imports for that file

### 13. Refresh & Expand/Collapse ✓

**Test: Refresh Button**
- [ ] Make changes to imports manually in editor
- [ ] Click "Refresh" button
- [ ] Verify tree updates to reflect changes

**Test: Expand All**
- [ ] Collapse some directory nodes
- [ ] Click "Expand All"
- [ ] Verify all nodes expand

**Test: Collapse All**
- [ ] Expand some directory nodes
- [ ] Click "Collapse All"
- [ ] Verify all nodes collapse

### 14. Go to Target Button ✓

**Test: Navigate to Target File**
- [ ] View a different file while locked
- [ ] Click "Go to Target" button
- [ ] Verify editor switches to the target (locked) file

### 15. File View Tracking ✓

**Test: Currently Viewed Indicator**
- [ ] Open a file that appears in the tree
- [ ] Verify that file has ● indicator in tree
- [ ] Switch to different file
- [ ] Verify ● moves to the new file

### 16. Import Suggestions ✓

**Test: Keyword-Based Suggestions**
- [ ] Create a test file using keywords from another resource file
- [ ] Don't import the resource file yet
- [ ] Open the test file
- [ ] Verify "Suggested Files" shows the resource file with ⭐
- [ ] This helps you know what to import!

## Integration Test Scenarios

### Scenario 1: Complete Workflow
1. Create new test file
2. Write test cases using undefined keywords
3. Open import tree
4. Check suggested files
5. Select and apply imports
6. Verify keywords are now available

### Scenario 2: Multi-File Browsing
1. Open test.robot
2. Lock the target
3. Browse multiple resource files to view keywords
4. Return to test.robot (auto-unlocks)
5. Apply selected imports

### Scenario 3: Refactoring Imports
1. Open file with many imports
2. Delete unnecessary imports via tree
3. Search for new files to add
4. Preview before applying
5. Apply changes

## Performance Checks

- [ ] Tree loads in < 2 seconds for 100+ files
- [ ] Search filters instantly
- [ ] File switching is smooth
- [ ] No lag when checking/unchecking items

## Error Handling

- [ ] Try to create file with existing name → shows overwrite dialog
- [ ] Try to apply imports to non-robot file → appropriate error
- [ ] Invalid import syntax → handles gracefully

## Final Verification

- [ ] All buttons work as expected
- [ ] No console errors in PyCharm logs
- [ ] UI is responsive
- [ ] All features match VSCode extension functionality

---

**Extension Version**: 1.0-SNAPSHOT
**PyCharm Version**: 2023.2+
**Build**: `./gradlew build`
**Installation**: Settings → Plugins → Install Plugin from Disk
