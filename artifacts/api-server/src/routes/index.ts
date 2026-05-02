import { Router, type IRouter } from "express";
import healthRouter from "./health";
import businessesRouter from "./businesses";
import contentRouter from "./content";
import notificationsRouter from "./notifications";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(businessesRouter);
router.use(contentRouter);
router.use(notificationsRouter);
router.use(settingsRouter);
router.use(dashboardRouter);

export default router;
