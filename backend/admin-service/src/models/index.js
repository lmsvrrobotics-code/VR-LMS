const sequelize = require('../config/database');

const Category = require('./Category')(sequelize);
const Course = require('./Course')(sequelize);
const SeoField = require('./SeoField')(sequelize);
const User = require('./User')(sequelize);
const Lesson = require('./Lesson')(sequelize);
const Section = require('./Section')(sequelize);
const Question = require('./Question')(sequelize);
const QuizSubmission = require('./QuizSubmission')(sequelize);
const Setting = require('./Setting')(sequelize);
const LiveClass = require('./LiveClass')(sequelize);
const Coupon = require('./Coupon')(sequelize);
const Certificate = require('./Certificate')(sequelize);
const PreAssessmentResult = require('./PreAssessmentResult')(sequelize);
const UserProgress = require('./UserProgress')(sequelize);
const LessonCompletion = require('./LessonCompletion')(sequelize);
const LessonWatchProgress = require('./LessonWatchProgress')(sequelize);
const Language = require('./Language')(sequelize);
const Forum = require('./Forum')(sequelize);
const ForumReport = require('./ForumReport')(sequelize);
const Program = require('./Program')(sequelize);
const Batch = require('./Batch')(sequelize);
const BatchMember = require('./BatchMember')(sequelize);
const EmailJob = require('./EmailJob')(sequelize);
const Gallery = require('./Gallery')(sequelize);
const Book = require('./Book')(sequelize);
const Slot = require('./Slot')(sequelize);
const Demo = require('./Demo')(sequelize);
const ClassSession = require('./ClassSession')(sequelize);
const Project = require('./Project')(sequelize);
const Testimonial = require('./Testimonial')(sequelize);
const Resource = require('./Resource')(sequelize);
const ResourceCategory = require('./ResourceCategory')(sequelize);
const TeacherFreeSchedule = require('./TeacherFreeSchedule')(sequelize);
const StudentRecord = require('./StudentRecord')(sequelize);
const StudentLearning = require('./StudentLearning')(sequelize);
// Teacher-delegation layer: admin assigns a course+roster to a teacher
// (TeachingAssignment + AssignmentMember), teacher drips lessons (LessonRelease).
const TeachingAssignment = require('./TeachingAssignment')(sequelize);
const AssignmentMember = require('./AssignmentMember')(sequelize);
const LessonRelease = require('./LessonRelease')(sequelize);
// Leads — public signups awaiting admin follow-up / conversion to students.
const Lead = require('./Lead')(sequelize);
// Payments — Razorpay course purchases (paywall source of truth).
const Payment = require('./Payment')(sequelize);
// Admin-editable key/value app settings (SMTP/email config from dashboard).
const AppSetting = require('./AppSetting')(sequelize);
// Learning centers shown on the public Locations page (admin-managed).
const Location = require('./Location')(sequelize);
// Student → teacher/class feedback (inverse of StudentRecord evaluation).
const TeacherFeedback = require('./TeacherFeedback')(sequelize);
// Marketing/demo videos shown to students (CEO intro + sample teasers).
const DemoVideo = require('./DemoVideo')(sequelize);
// Teacher-authored dynamic feedback forms + their one-time student responses.
const FeedbackForm = require('./FeedbackForm')(sequelize);
const FeedbackResponse = require('./FeedbackResponse')(sequelize);
// Public "Send us a Message" contact submissions (admin inbox).
const ContactMessage = require('./ContactMessage')(sequelize);

const models = { Category, Course, SeoField, User, Lesson, Section, Question, QuizSubmission, Setting, LiveClass, Coupon, Certificate, PreAssessmentResult, UserProgress, LessonCompletion, LessonWatchProgress, Language, Forum, ForumReport, Program, Batch, BatchMember, EmailJob, Gallery, Book, Slot, Demo, ClassSession, Project, Testimonial, Resource, ResourceCategory, TeacherFreeSchedule, StudentRecord, StudentLearning, TeachingAssignment, AssignmentMember, LessonRelease, Lead, Payment, AppSetting, Location, TeacherFeedback, DemoVideo, FeedbackForm, FeedbackResponse, ContactMessage };
Object.values(models).forEach((m) => m.associate && m.associate(models));

module.exports = { sequelize, ...models };
