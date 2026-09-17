import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      message: 'Token akses diperlukan' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    req.user = decoded; // Store user info in request object
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token sudah kedaluwarsa' 
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Token tidak valid' 
      });
    } else {
      return res.status(401).json({ 
        message: 'Gagal memverifikasi token' 
      });
    }
  }
};

// Izin berbasis peran. Lolos bila: legacy admin, klaim '*' , atau pegang semua key.
// Dipakai untuk endpoint baru; endpoint lama tetap memakai requireAdmin agar kompatibel.
export const requirePermission = (...keys) => (req, res, next) => {
  const granted = req.user?.permissions;
  if (req.user?.roles === 'admin') return next();
  if (Array.isArray(granted) && (granted.includes('*') || keys.every((k) => granted.includes(k)))) {
    return next();
  }
  return res.status(403).json({
    message: 'Akses ditolak. Butuh izin: ' + keys.join(', ') + '.',
  });
};

// Middleware to check if user is admin
export const requireAdmin = (req, res, next) => {
  if (req.user.roles !== 'admin') {
    return res.status(403).json({ 
      message: 'Akses ditolak. Hanya admin yang dapat mengakses resource ini.' 
    });
  }
  next();
};

// Middleware to check if user can access resource (admin or own resource)
export const requireAdminOrOwner = (req, res, next) => {
  const { id } = req.params;
  
  if (req.user.roles !== 'admin' && req.user.userId !== parseInt(id)) {
    return res.status(403).json({ 
      message: 'Akses ditolak. Anda hanya dapat mengakses resource sendiri.' 
    });
  }
  next();
};