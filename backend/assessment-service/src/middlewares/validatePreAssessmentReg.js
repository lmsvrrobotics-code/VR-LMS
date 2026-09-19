import { GENDERS } from "../utils/preAssessmentConstants.js";

// Matches admin-service/src/lib/fieldValidation.js. This service is ESM and
// stands alone, so the rule is duplicated rather than imported — keep the two
// in step. The previous /^[^\s@]+@[^\s@]+\.[^\s@]+$/ accepted "a@b..c" and
// "a@-.x": addresses that store fine and then bounce on the first mail.
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;

// Pre-flight validator for the registration POST. Multer has already parsed
// multipart fields by the time this runs, so all values arrive as strings.
export default function validatePreAssessmentReg(req, res, next) {
  const errors = {};
  const body = req.body || {};

  const fullName = (body.fullName || "").trim();
  if (!fullName) errors.fullName = "Full name is required";
  else if (fullName.length < 2 || fullName.length > 120)
    errors.fullName = "Full name must be between 2 and 120 characters";

  const email = (body.email || "").trim().toLowerCase();
  if (!email) errors.email = "Email is required";
  else if (email.includes("..")) errors.email = "Email address cannot contain two dots in a row.";
  else if (!email.includes("@"))
    errors.email = "Email address must include an @ sign — for example name@example.com.";
  else if (!EMAIL_REGEX.test(email))
    errors.email = "Email address doesn't look like a valid email — for example name@example.com.";

  const phoneNumber = (body.phoneNumber || "").trim();
  if (!phoneNumber) errors.phoneNumber = "Phone number is required";
  else if (!PHONE_REGEX.test(phoneNumber))
    errors.phoneNumber = "Phone number must be 7-20 digits";

  const gender = (body.gender || "").trim();
  if (!gender) errors.gender = "Gender is required";
  else if (!GENDERS.includes(gender))
    errors.gender = `Gender must be one of: ${GENDERS.join(", ")}`;

  // selectedProgram is now an admin-created title (free text, max 255 chars
  // to match the column). selectedProgramId is the FK back to programs.id so
  // analytics can join even after a title rename. Both are required so a
  // legacy client that only sends the title gets a clear validation error.
  const selectedProgram = (body.selectedProgram || "").trim();
  if (!selectedProgram) errors.selectedProgram = "Program selection is required";
  else if (selectedProgram.length > 255)
    errors.selectedProgram = "Program title is too long";

  const programIdRaw = body.selectedProgramId;
  let selectedProgramId = null;
  if (programIdRaw === undefined || programIdRaw === null || String(programIdRaw).trim() === "") {
    errors.selectedProgramId = "Program selection is required";
  } else {
    const n = Number(programIdRaw);
    if (!Number.isInteger(n) || n <= 0) {
      errors.selectedProgramId = "Invalid program selection";
    } else {
      selectedProgramId = n;
    }
  }

  // Checkboxes serialise as strings ("true"/"false") through multipart forms.
  const declarationRaw = body.declarationAccepted;
  const declarationAccepted =
    declarationRaw === true ||
    declarationRaw === "true" ||
    declarationRaw === "1" ||
    declarationRaw === "on";
  if (!declarationAccepted)
    errors.declarationAccepted = "You must accept the declaration to continue";

  if (!req.file)
    errors.collegeProof = "College ID / proof file is required";

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  // Hand sanitised values to the controller so it doesn't re-trim everywhere.
  req.validatedBody = {
    fullName,
    email,
    phoneNumber,
    gender,
    selectedProgram,
    selectedProgramId,
    declarationAccepted,
  };

  next();
}
