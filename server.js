import dotenv from 'dotenv';
import express, { json, response } from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import nodemailer from 'nodemailer';
import { v2 as cloudinary } from 'cloudinary';
import {
    createUserSQL, getUserSQL,
    getUsersSQL, checkUserSQL, createProjectSQL, createBlogSQL,
    getProjectsSQL, getProjectSQL,
    deleteProjectSQL, updatePasswordSQL, createRecievedMailSQL,
    getBlogsSQL
} from './controllers/database_controller.js';
import { errorMonitor } from 'events';
dotenv.config();



const PORT = process.env.PORT || 8080;
const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173'];

app.use(cors({
    origin: allowedOrigins, // NO '*'
    credentials: true,      // allows cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
})) // 
app.use(express.json())
app.use(express.urlencoded({ extended: true }));



//Cloudunary Setup
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET

});

// EMAIL Setup
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.USER_EMAIL,
        pass: process.env.USER_EMAIL_PASSWORD
    }
});


// Handles and report errors tha may arise while starting the server.
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 'message': 'Something broke!' });
})

//This API route handles te creation of new user.
export async function createUser() {
    const authMiddleware = async (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token' })
        }
        else {
            try {
                const decoded = await jwt.verify(token, process.env.JWT_SECRET)
                req.user = { id: decoded.userId }
                next()
            } catch (error) { return res.status(401).json({ error: "Invalid token" }) }
        }
    }
    const user = await app.post('/create-user', authMiddleware, async (req, res) => {
        const { username, password, role } = req.body;
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const response = await createUserSQL(username, hashedPassword, role);
            if (response.ok) {
                res.status(201).json({ 'ok': true, 'status': 201, 'message': response.SQLMessage, userId: response.insertId });
            }
            else if (response.taken) {
                res.status(401).json({ 'ok': false, 'status': 401, 'message': response.SQLMessage });
            }
            else {
                res.status(500).json({ 'ok': false, 'status': 500, 'message': response.SQLMessage })
            }

        }
        catch (error) {
            if (error instanceof Error)
                res.status(500).json({ 'ok': false, 'status': 500, 'message': 'An error occurred while creating user' });
        }
    }
    );
}

//This API route handling creation of new user.
export async function fetchUsers() {
    const users = await app.get('/users', async (req, res) => {
        try {
            const data = await getUsersSQL();
            res.status(200).send(data);
        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).send({ error: 'An error occurred while fetching users' });
        }
    })
}

//This API route handles the finding of one user.
export async function findOneUser(id) {
    const user = await app.get('/users/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const data = await getUserSQL(id);
            res.status(200).send(data);
        } catch (error) {
            res.status(500).send({ error: 'An error occurred while fetching user' });
        }
    })
}

//This API route handles the checking if user exists.
export async function logIn() {
    const data = await app.post('/login', async (req, res) => {
        const { username, password } = req.body;
        try {
            const user = await checkUserSQL(username);
            if (user === null) {
                res.status(401).json({ 'message': "Invalid Username or Password" })
            } else {
                const isMatch = await bcrypt.compare(password, user.password);
                if (isMatch) {
                    const token = jwt.sign({ userId: user.id, username: username },
                        process.env.JWT_SECRET,
                        { expiresIn: '15m' }
                    );
                    res.status(201).json({ token, 'ok': true, id: user.id, user: username });
                    res.cookie('token', token, {
                        httpOnly: true,
                        secure: true,
                        sameSite: 'none'
                    });
                    res.json({ ok: true });
                }
                else { res.status(401).json({ 'ok': false }) }
            }
        } catch (error) {
            res.status(500).send(error);
        }
    });
}

//This API route handles the creation of new user.
async function createProject() {
    // This sets up multer to facilitate uploading of file.
    const storage = multer.memoryStorage();
    const upload = multer({
        storage,
        limits: { fileSize: 5 * 1024 * 1024 }
    });

    await app.post('/create-project', upload.single('img_file'), async (req, res) => {
        const { project_title, project_author, project_description } = req.body;
        try {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'portfolio/projects' }, // path for desired cloudinary folder
                    (error, result) => {
                        if (error) reject(error)
                        else resolve(result)
                    }
                ).end(req.file.buffer)
            })
            const project_img_url = result.secure_url;
            const project_public_id = result.public_id;
            const sql_response = await createProjectSQL(
                project_title,
                project_author,
                project_description,
                project_img_url,
                project_public_id
            )
            if (sql_response.affectedRows > 0) {
                res.status(200).json({ 'status': 200, 'ok': true, 'message': 'project created succesfully', });
            } else {
                res.status(501).json({ 'status': 502, 'ok': false, 'message': 'unable to create project', })
            }
        } catch (error) {
            if (error.errno === -3008) {
                res.status(502).json({ 'ok': false, 'status': 501, 'message': 'Could not connect, please check your internet' });
            } else {
                res.status(500).json({ 'ok': false, 'status': 500, 'message': 'Internal Server error, try later' });
            }
        }

    })

}

// This API gets a single project using the ID
export async function getProject(id) {
    const response = app.get('/projects/:id', async (req, res) => {
        const id = req.params.id;
        const data = await getProjectSQL(id)
        data.length > 0 ? res.status(201).send(data) : res.status(401).send({ "Message": 'No project Found' })
    });

}

//This API route handles fetching odf all project.
export async function getProjects() {
    app.get("/projects", async (req, res) => {
        try {
            const data = await getProjectsSQL();
            // Return 200 even if empty. Only 500 for actual errors
            res.status(200).send(data);
        } catch (error) {
            console.error('Error fetching projects:', error);
            res.status(500).send({ error: 'An error occurred while fetching projects' });
        }
    });
}

export async function deleteProject() {
    try {
        await app.delete('/delete-project/:id', async (req, res) => {
            const id = req.params.id;
            const response = await deleteProjectSQL(id);
            response.ok ? res.status(201).send(response) : res.status(401).send(response)
        })
    } catch (error) {
        throw new Error(error);
    }

}
//This API route handles the creation of new blog.
async function CreateBlog() {
    //Multer set up for blog
    const storage = multer.memoryStorage();
    const upload = multer({
        storage,
        limits: { fileSize: 5 * 1024 * 1024 }
    });
    await app.post('/create-blog', upload.single('blog_file'), async (req, res) => {
        const { blog_title, blog_excerpt, blog_content, blog_creation_date, blog_category } = req.body;
        try {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'portfolio/blogs' }, // optional folder in Cloudinary
                    (error, result) => {
                        if (error) reject(error)
                        else resolve(result)
                    }
                ).end(req.file.buffer)
            })
            const blog_img_url = result.secure_url;
            const blog_public_id = result.public_id;

            const sql_response = await createBlogSQL(
                {
                    blog_title, blog_excerpt, blog_content, blog_creation_date,
                    blog_category, blog_img_url, blog_public_id
                }
            );
            if (sql_response.affectedRows > 0) {
                res.status(200).json({ 'status': 200, 'ok': true, 'message': response.SQLMessage });
            } else {
                res.status(500).json({ 'status': 500, 'ok': false, 'message': response.SQLMessage })
            }

        } catch (error) {
            console.error(error);
            if (error.errno === -3008) {
                res.status(502).json({ 'status': 502, 'ok': false, 'message': 'Could not connect, please check your internet' });
            } else {
                res.status(500).json({ 'status': 500, 'ok': false, 'message': 'Internal Server error, try later' });
            }
        }

    })

}

export async function getBlogs() {
    const response = app.get("/blog", async (req, res) => {
        try {
            const data = await getBlogsSQL();
            data.length > 0 ? res.status(200).send(data) : res.status(401).send({ "message": data.SQLMessage })
        } catch (error) {
            console.error('Error fetching projects:', error);
            res.status(500).send({ error: 'An error occurred while fetching blogs' });
        }
    })
}

//Password Reset
export async function resetPassword() {
    const authMiddleware = async (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token' })
        }
        else {
            try {
                const decoded = await jwt.verify(token, process.env.JWT_SECRET)
                req.user = { id: decoded.userId }
                next()
            } catch (error) { return res.status(401).json({ error: "Invalid token" }) }
        }
    }
    const response = await app.put('/reset-password', authMiddleware, async (req, res) => {
        try {
            const userId = req.user.id;
            const { oldPassword, newPassword } = req.body;
            if (!oldPassword || !newPassword) return res.status(400).json({ 'message': 'All field required', "ok": false })
            const [user] = await getUserSQL(userId);
            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) {
                res.status(404).json({ "message": 'Old Password Incorrect', "ok": false })
            } else {
                const hashedPassword = await bcrypt.hash(newPassword, 10)
                await updatePasswordSQL(userId, hashedPassword).
                    then(res.status(200).json({ 'ok': true, 'message': 'Password updated successfully' }));
            }
        } catch (error) {
            res.status(500).json({ error: 'Sever Error', 'message': error })
        }
    },
    )

}


// Check email connectivity
async function checkMailNetworkStatus() {
    let mailStatus = { ok: false, message: 'Checking...' }
    transporter.verify((error, success) => {
        if (error) {
            console.log('SMTP Error:', error)
            mailStatus = { ok: false, message: 'Network is unstable' }
        } else {
            console.log('SMTP Ready')
            mailStatus = { ok: true, message: 'Network is stable, send mail' }
        }
    })

    app.get("/check-mail-network", (req, res) => {
        res.status(mailStatus.ok ? 200 : 503).json({
            'status': mailStatus.ok ? 200 : 503,
            'ok': mailStatus.ok,
            "message": mailStatus.message
        })
    });

    setInterval(() => {
        transporter.verify((error, success) => {
            mailStatus = error ? { ok: false, message: 'Network is unstable' } : 
            { ok: true, message: 'Network is stable, send mail' }
        })
    }, 1000 * 60 * 1)
}

export async function sendAndSaveMail() {
    await app.post("/send-mail", async (req, res) => {
        const { name, email, subject, message } = req.body;
        const mailOptions = {
            name: name,
            email: email, subject: subject,
            text: message,
            to: process.env.USER_EMAIL
        }
        try {
            await transporter.sendMail(mailOptions, async (error, info) => {
                if (error) {
                    console.error('Error sending email:', error);
                    res.status(500).json({ 'ok': false, 'message': 'Unable to send email' });
                }
                else {
                    const sql_response = await createRecievedMailSQL(mailOptions.name, mailOptions.email, mailOptions.subject, mailOptions.text);
                    if (sql_response.ok) {
                        res.status(200).json({ 'ok': true, 'message': 'Email sent successfully' })
                    }
                    else {
                        res.status(500).json({ 'ok': false, 'message': 'Email sent but not saved' })
                    }
                }
            }
            );
        } catch (error) {
            res.status(500).json({ 'ok': false, 'message': 'Internal Server error, Email not sent' })
        }
    }
    );
}


export async function getApiStatus() {
    app.get('/', (req, res) => {
        res.json({ ok: true, message: "API is up" })
    })

    app.get('/health', (req, res) => {
        res.json({ db: "connected" })
    })
}


// Starting the server.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sever is up and running on port ${process.env.PORT}`)
});



createUser();
fetchUsers();
findOneUser();
logIn();
createProject();
getProject()
getProjects();
deleteProject();
resetPassword();
sendAndSaveMail();
CreateBlog();
getBlogs();
checkMailNetworkStatus();
getApiStatus();

