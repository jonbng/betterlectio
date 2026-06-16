import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';

const gymIdKey = "gym_id";
const usernameKey = "username";
const passwordKey = "password";
const cookieKey = "cookie";
const studentIdKey = "student_id";
const expirationDateKey = "expiration";

class AutologinError extends Error {}

class LoginService {
  var storage = const FlutterSecureStorage();

  LoginService();

  Future<bool> _containsMinimum() async {
    return await storage.containsKey(key: gymIdKey) &&
        await storage.containsKey(key: usernameKey) &&
        await storage.containsKey(key: passwordKey);
  }

  Future<bool> _containsRequired() async {
    return await _containsMinimum() &&
        await storage.containsKey(key: cookieKey) &&
        await storage.containsKey(key: studentIdKey);
  }

  Future<Account?> _getSavedAccount() async {
    String? gymIdValue = await storage.read(key: gymIdKey);
    String? username = await storage.read(key: usernameKey);
    String? password = await storage.read(key: passwordKey);
    if (gymIdValue != null && username != null && password != null) {
      return Account(
        int.parse(gymIdValue),
        username,
        password,
        loginError: () {
          return _getSavedAccount_();
        },
      );
    }
    return null;
  }

  Future<void> syncCookies(Student student) async {
    var savedAccount = await _getSavedAccount();
    if (savedAccount != null) {
      await save(savedAccount, student);
    }
  }

  Future<List<Cookie>> _getSavedCookies() async {
    String? cookieString = await storage.read(key: cookieKey);
    if (cookieString != null) {
      List<Cookie> cookies = cookieString.split(';').map((cookieStr) {
        var cookie = cookieStr.split('=');
        return Cookie(cookie[0], cookie[1]);
      }).toList();
      return cookies;
    }
    return [];
  }

  Future<Student?> loadSaved() async {
    Account? savedAccount = await _getSavedAccount();

    if (await _containsRequired() && savedAccount != null) {
      String studentId = await storage.read(key: studentIdKey) ?? "";
      List<Cookie> cookies = await _getSavedCookies();
      var autologinCookies = cookies
          .where((cookie) => cookie.name.toLowerCase().contains("autologin"))
          .toList();
      if (autologinCookies.isNotEmpty) {
        var student =
            await savedAccount.loginWithCookies(autologinCookies, studentId);
        if (student != null) {
          await save(savedAccount, student);
        } else {
          throw AutologinError();
        }
        return student;
      }
    }

    return null;
  }

  Future<Account> _getSavedAccount_() async {
    return (await _getSavedAccount())!;
  }

  Future<Student?> login(Account account) async {
    var accountWithAutologin = Account(
      account.gymId,
      account.username,
      account.password,
      loginError: () {
        return _getSavedAccount_();
      },
    );
    var student = await accountWithAutologin.login(autologin: false);
    if (student != null) {
      save(account, student);
      return student;
    } else {
      await delete();
    }
    return null;
  }

  Future<void> save(Account account, Student student) async {
    var cookies = await student.getCookies();
    var cookieString =
        cookies.map((cookie) => "${cookie.name}=${cookie.value}").join(';');

    await storage.write(key: usernameKey, value: account.username);
    await storage.write(key: passwordKey, value: account.password);
    await storage.write(key: gymIdKey, value: account.gymId.toString());
    await storage.write(key: cookieKey, value: cookieString);
    await storage.write(key: studentIdKey, value: student.studentId);
  }

  Future<void> delete() async {
    await storage.deleteAll();
  }
}
